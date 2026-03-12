import { toast } from '@/hooks/useToast'
import { appNavigate } from '@/lib/navigation'
import { applyChatEventToTree } from '@/lib/chat/api/event-handlers'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import { useChatSessionStore } from '@/stores/zustand/useChatSessionStore'
import type { Message, MessageLike, SerializedMessage } from '@/types/message'
import type { ChatAgentStatus, MessageTreeSnapshot } from '@/types/chat-api'
import type { ChatServerToClientEvent } from '@/types/chat-event-types'

const AGENT_NAME = 'chat-agent'
const BUSY_WARNING = 'This conversation is already generating a response.'
const SELECT_ROLE_WARNING = 'Select a role before sending a message.'
const QUOTA_EXCEEDED_MESSAGE = 'Quota exceeded.'

type FinishedChatStatus = 'completed' | 'aborted' | 'error'

export type AgentStatusResponse = {
  status: ChatAgentStatus
  requestId?: string
}

type StartRequestPayload = {
  messages: Message[]
  titleSource?: MessageLike
  preferLocalTitle?: boolean
}

type ChatStatusEvent =
  | { type: 'sync'; status: ChatAgentStatus; requestId?: string }
  | { type: 'started'; requestId: string }
  | { type: 'finished'; requestId: string; status: FinishedChatStatus }
  | { type: 'busy'; currentRequestId: string }

const eventCursor = (() => {
  let value = 0

  return {
    get value() {
      return value
    },
    mark(eventId: number) {
      if (eventId > value) {
        value = eventId
      }
    },
    shouldConsume(eventId: number) {
      return eventId > value
    },
    reset() {
      value = 0
    },
  }
})()

let activeAbortController: AbortController | null = null

export const resetLastEventId = () => eventCursor.reset()

const resolveAgentBaseUrl = () => {
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'https'
      : 'http'
  const host =
    typeof window !== 'undefined' ? window.location.host : 'localhost:3000'

  return `${protocol}://${host}/agents/${AGENT_NAME}`
}

const isChatAgentStatus = (value: unknown): value is ChatAgentStatus =>
  value === 'idle' ||
  value === 'running' ||
  value === 'completed' ||
  value === 'aborted' ||
  value === 'error'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const generateId = (prefix = 'id') =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`

const replaceActiveAbortController = (linkedSignal?: AbortSignal) => {
  activeAbortController?.abort()

  const controller = new AbortController()
  activeAbortController = controller

  const handleLinkedAbort = () => controller.abort()
  if (linkedSignal) {
    linkedSignal.addEventListener('abort', handleLinkedAbort)
  }

  return {
    signal: controller.signal,
    release() {
      if (linkedSignal) {
        linkedSignal.removeEventListener('abort', handleLinkedAbort)
      }
      if (activeAbortController === controller) {
        activeAbortController = null
      }
    },
  }
}

const consumeSSE = async (
  body: ReadableStream<Uint8Array>,
  onMessage: (event: string, data: string) => void,
  signal?: AbortSignal,
) => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = () => {
    let boundaryIndex = buffer.indexOf('\n\n')

    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)
      boundaryIndex = buffer.indexOf('\n\n')

      if (!block.trim()) {
        continue
      }

      let event = 'message'
      const dataLines: string[] = []

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trimStart()
          continue
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
      }

      if (dataLines.length > 0) {
        onMessage(event, dataLines.join('\n'))
      }
    }
  }

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      flush()
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n')
    flush()
  } finally {
    reader.cancel().catch(() => {})
  }
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError')

const isRecoverableStreamError = (error: unknown) => {
  if (isAbortError(error) || !(error instanceof Error)) {
    return false
  }

  if (error.message.startsWith('Chat request failed:')) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    error instanceof TypeError ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('stream') ||
    message.includes('load failed')
  )
}

const resetRequestState = () => {
  const store = useChatRequestStore.getState()
  store.clearRequestState()
  store.setConnectionState('idle')
}

const markRequestDisconnected = (requestId?: string | null) => {
  const store = useChatRequestStore.getState()

  if (
    requestId &&
    store.activeRequestId &&
    store.activeRequestId !== requestId
  ) {
    return
  }

  if (store.requestPhase === 'done') {
    return
  }

  store.setRequestPhase('answering')
  store.setConnectionState('disconnected')
}

const handleChatEvent = (event: ChatServerToClientEvent, requestId: string) => {
  const store = useChatRequestStore.getState()
  const isConversationUpdate = event.type === 'conversation_updated'

  if (
    !isConversationUpdate &&
    store.activeRequestId &&
    store.activeRequestId !== requestId
  ) {
    return
  }

  if (
    !isConversationUpdate &&
    (store.activeRequestId === requestId || store.requestPhase !== 'done')
  ) {
    store.setRequestPhase('answering')
  }

  applyChatEventToTree(event)
}

const consumeEvent = (item: Record<string, unknown>) => {
  const eventId = typeof item.eventId === 'number' ? item.eventId : null
  const requestId = typeof item.requestId === 'string' ? item.requestId : null
  const event = isRecord(item.event)
    ? (item.event as ChatServerToClientEvent)
    : null

  if (!eventId || !requestId || !event || !eventCursor.shouldConsume(eventId)) {
    return
  }

  eventCursor.mark(eventId)
  handleChatEvent(event, requestId)
}

const handleChatStatus = (statusEvent: ChatStatusEvent) => {
  const store = useChatRequestStore.getState()

  switch (statusEvent.type) {
    case 'busy':
      toast.warning(BUSY_WARNING)
      store.setRequestPhase('answering')
      store.setActiveRequestId(statusEvent.currentRequestId)
      store.setConnectionState('connected')
      return

    case 'started':
      store.setRequestPhase(
        store.requestPhase === 'answering' ? 'answering' : 'sending',
      )
      store.setActiveRequestId(statusEvent.requestId)
      store.setConnectionState('connected')
      return

    case 'sync':
      if (statusEvent.status === 'running') {
        store.setRequestPhase('answering')
        store.setActiveRequestId(statusEvent.requestId ?? store.activeRequestId)
        store.setConnectionState('connected')
        return
      }

      if (statusEvent.status === 'idle') {
        resetRequestState()
        return
      }

      store.setRequestPhase('done')
      store.setActiveRequestId(null)
      return

    case 'finished':
      if (
        store.activeRequestId &&
        store.activeRequestId !== statusEvent.requestId
      ) {
        return
      }

      store.setRequestPhase('done')
      store.setActiveRequestId(null)
      store.setConnectionState('connected')
  }
}

const dispatchSSE = (event: string, raw: string) => {
  let payload: Record<string, unknown>

  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return
    }
    payload = parsed
  } catch {
    return
  }

  switch (event) {
    case 'chat_event':
      consumeEvent(payload)
      return

    case 'chat_started':
      if (typeof payload.requestId === 'string') {
        handleChatStatus({ type: 'started', requestId: payload.requestId })
      }
      return

    case 'chat_finished':
      if (typeof payload.requestId !== 'string') {
        return
      }

      handleChatStatus({
        type: 'finished',
        requestId: payload.requestId,
        status:
          payload.status === 'completed' ||
          payload.status === 'aborted' ||
          payload.status === 'error'
            ? payload.status
            : 'error',
      })
      return

    case 'sync_response':
      handleChatStatus({
        type: 'sync',
        status: isChatAgentStatus(payload.status) ? payload.status : 'idle',
        requestId:
          typeof payload.requestId === 'string' ? payload.requestId : undefined,
      })

      if (!Array.isArray(payload.events)) {
        return
      }

      for (const item of payload.events) {
        if (isRecord(item)) {
          consumeEvent(item)
        }
      }
      return

    case 'busy':
      if (typeof payload.currentRequestId === 'string') {
        handleChatStatus({
          type: 'busy',
          currentRequestId: payload.currentRequestId,
        })
      }
      return

    case 'conversation_update':
      if (
        typeof payload.conversationId === 'string' &&
        typeof payload.title === 'string' &&
        typeof payload.updated_at === 'string'
      ) {
        applyChatEventToTree({
          type: 'conversation_updated',
          conversationId: payload.conversationId,
          title: payload.title,
          updated_at: payload.updated_at,
        })
      }
  }
}

const consumeStreamResponse = async (
  response: Response,
  signal: AbortSignal,
) => {
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`)
  }

  await consumeSSE(response.body, dispatchSSE, signal)
}

const buildPreparedRequest = (
  conversationId: string,
  role: string,
  promptId: string | undefined,
  requestId: string,
  messages: Message[],
) => {
  const rawTreeSnapshot: MessageTreeSnapshot = useChatSessionStore
    .getState()
    .getTreeState()
  const treeSnapshot: MessageTreeSnapshot = {
    ...rawTreeSnapshot,
    messages: rawTreeSnapshot.messages,
  }

  const conversationHistory: SerializedMessage[] = messages.map(
    (message) =>
      ({
        role: message.role,
        blocks: message.blocks,
      }) as SerializedMessage,
  )

  return {
    requestId,
    role,
    promptId,
    conversationId,
    conversationHistory,
    treeSnapshot,
  }
}

export const checkAgentStatus = async (
  conversationId: string,
): Promise<AgentStatusResponse> => {
  const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}`, {
    method: 'GET',
    credentials: 'include',
  })

  if (response.status === 404) {
    return { status: 'idle' }
  }

  if (!response.ok) {
    throw new Error(`Agent status probe failed: ${response.status}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    status: isChatAgentStatus(data.status) ? data.status : 'idle',
    requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
  }
}

export const startChatRequest = async ({
  messages,
}: StartRequestPayload) => {
  const requestStore = useChatRequestStore.getState()
  const sessionStore = useChatSessionStore.getState()

  if (requestStore.requestPhase !== 'done') {
    return
  }

  if (!sessionStore.currentRole) {
    toast.warning(SELECT_ROLE_WARNING)
    return
  }

  let conversationId = sessionStore.conversationId
  const requestId = generateId('msg')

  if (!conversationId) {
    conversationId = generateId('conv')
    const now = new Date().toISOString()

    useChatSessionStore.getState().setConversationId(conversationId)
    useChatSessionStore.getState().addConversation({
      id: conversationId,
      title: 'New Chat',
      role: sessionStore.currentRole,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    })
    appNavigate(`/app/c/${conversationId}`)
  }

  const body = buildPreparedRequest(
    conversationId,
    sessionStore.currentRole,
    sessionStore.currentPrompt || undefined,
    requestId,
    messages,
  )

  const { signal, release } = replaceActiveAbortController()
  requestStore.setRequestPhase('sending')
  requestStore.setActiveRequestId(requestId)
  requestStore.setConnectionState('connecting')

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    })

    if (response.status === 409) {
      const data = (await response.json()) as Record<string, unknown>
      if (typeof data.currentRequestId === 'string') {
        handleChatStatus({
          type: 'busy',
          currentRequestId: data.currentRequestId,
        })
      }
      return
    }

    if (response.status === 402) {
      const data = (await response.json()) as Record<string, unknown>
      applyChatEventToTree({
        type: 'error',
        message:
          typeof data.message === 'string'
            ? data.message
            : QUOTA_EXCEEDED_MESSAGE,
      })
      resetRequestState()
      return
    }

    requestStore.setConnectionState('connected')
    await consumeStreamResponse(response, signal)

    if (useChatRequestStore.getState().activeRequestId === requestId) {
      markRequestDisconnected(requestId)
    }
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    if (isRecoverableStreamError(error)) {
      markRequestDisconnected(requestId)
      return
    }

    resetRequestState()
  } finally {
    release()
  }
}

export const stopActiveChatRequest = () => {
  const conversationId = useChatSessionStore.getState().conversationId
  const requestId = useChatRequestStore.getState().activeRequestId

  activeAbortController?.abort()
  activeAbortController = null

  if (conversationId) {
    fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId }),
    }).catch(() => {})
  }

  resetRequestState()
}

export const resumeRunningConversation = async (
  conversationId: string,
  signal: AbortSignal,
) => {
  if (!conversationId) {
    return
  }

  let agentStatus: AgentStatusResponse

  try {
    agentStatus = await checkAgentStatus(conversationId)
  } catch {
    if (!signal.aborted) {
      markRequestDisconnected(useChatRequestStore.getState().activeRequestId)
    }
    return
  }

  if (agentStatus.status !== 'running') {
    resetRequestState()
    return
  }

  const requestStore = useChatRequestStore.getState()
  requestStore.setRequestPhase('answering')
  requestStore.setActiveRequestId(agentStatus.requestId ?? null)
  requestStore.setConnectionState('connecting')

  const activeRequest = replaceActiveAbortController(signal)

  try {
    const response = await fetch(
      `${resolveAgentBaseUrl()}/${conversationId}/events?lastEventId=${eventCursor.value}`,
      {
        credentials: 'include',
        signal: activeRequest.signal,
      },
    )

    requestStore.setConnectionState('connected')
    await consumeStreamResponse(response, activeRequest.signal)

    if (
      agentStatus.requestId &&
      useChatRequestStore.getState().activeRequestId === agentStatus.requestId
    ) {
      markRequestDisconnected(agentStatus.requestId)
    }
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    if (isRecoverableStreamError(error)) {
      markRequestDisconnected(agentStatus.requestId)
      return
    }

    resetRequestState()
  } finally {
    activeRequest.release()
  }
}
