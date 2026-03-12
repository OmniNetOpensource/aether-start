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
}

type StartRequestPayload = {
  messages: Message[]
  titleSource?: MessageLike
  preferLocalTitle?: boolean
}

type ChatStatusEvent =
  | { type: 'sync'; status: ChatAgentStatus }
  | { type: 'started' }
  | { type: 'finished'; status: FinishedChatStatus }
  | { type: 'busy' }

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
  if (linkedSignal?.aborted) {
    controller.abort()
  } else if (linkedSignal) {
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

const markRequestDisconnected = () => {
  const store = useChatRequestStore.getState()

  if (store.requestPhase === 'done') {
    return
  }

  store.setRequestPhase('answering')
  store.setConnectionState('disconnected')
}

const handleChatEvent = (event: ChatServerToClientEvent) => {
  const store = useChatRequestStore.getState()
  const isConversationUpdate = event.type === 'conversation_updated'

  if (!isConversationUpdate && store.requestPhase !== 'done') {
    store.setRequestPhase('answering')
  }

  applyChatEventToTree(event)
}

const consumeEvent = (item: Record<string, unknown>) => {
  const eventId = typeof item.eventId === 'number' ? item.eventId : null
  const event = isRecord(item.event)
    ? (item.event as ChatServerToClientEvent)
    : null

  if (!eventId || !event || !eventCursor.shouldConsume(eventId)) {
    return
  }

  eventCursor.mark(eventId)
  handleChatEvent(event)
}

const handleChatStatus = (statusEvent: ChatStatusEvent) => {
  const store = useChatRequestStore.getState()

  switch (statusEvent.type) {
    case 'busy':
      toast.warning(BUSY_WARNING)
      store.setRequestPhase('answering')
      store.setConnectionState('connected')
      return

    case 'started':
      store.setRequestPhase(
        store.requestPhase === 'answering' ? 'answering' : 'sending',
      )
      store.setConnectionState('connected')
      return

    case 'sync':
      if (statusEvent.status === 'running') {
        store.setRequestPhase('answering')
        store.setConnectionState('connected')
        return
      }

      if (statusEvent.status === 'idle') {
        resetRequestState()
        return
      }

      store.setRequestPhase('done')
      return

    case 'finished':
      store.setRequestPhase('done')
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
      handleChatStatus({ type: 'started' })
      return

    case 'chat_finished':
      handleChatStatus({
        type: 'finished',
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
      handleChatStatus({ type: 'busy' })
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
  idempotencyKey: string,
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
    idempotencyKey,
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
  const idempotencyKey = generateId('msg')

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
    idempotencyKey,
    messages,
  )

  const { signal, release } = replaceActiveAbortController()
  requestStore.setRequestPhase('sending')
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
      await response.json().catch(() => ({}))
      handleChatStatus({ type: 'busy' })
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

    markRequestDisconnected()
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    if (isRecoverableStreamError(error)) {
      markRequestDisconnected()
      return
    }

    resetRequestState()
  } finally {
    release()
  }
}

export const stopActiveChatRequest = () => {
  const conversationId = useChatSessionStore.getState().conversationId

  activeAbortController?.abort()
  activeAbortController = null

  if (conversationId) {
    fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => {})
  }

  resetRequestState()
}

export const resumeRunningConversation = async (
  conversationId: string,
  signal: AbortSignal,
) => {
  if (!conversationId || signal.aborted) {
    return
  }

  let agentStatus: AgentStatusResponse

  try {
    agentStatus = await checkAgentStatus(conversationId)
  } catch {
    if (!signal.aborted) {
      markRequestDisconnected()
    }
    return
  }

  if (agentStatus.status !== 'running') {
    resetRequestState()
    return
  }

  const requestStore = useChatRequestStore.getState()
  requestStore.setRequestPhase('answering')
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

    markRequestDisconnected()
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    if (isRecoverableStreamError(error)) {
      markRequestDisconnected()
      return
    }

    resetRequestState()
  } finally {
    activeRequest.release()
  }
}
