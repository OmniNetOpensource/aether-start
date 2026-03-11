import { toast } from '@/hooks/useToast'
import { useConversationsStore } from '@/stores/zustand/useConversationsStore'
import { applyChatEventToTree } from '@/lib/chat/api/event-handlers'
import { stripTransientSearchDataFromMessages } from '@/lib/chat/search-result-payload'
import type { Message, MessageLike, SerializedMessage } from '@/types/message'
import type { ChatAgentStatus, MessageTreeSnapshot } from '@/types/chat-api'
import { appNavigate } from '@/lib/navigation'
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import type { ChatServerToClientEvent } from '@/types/chat-event-types'

const AGENT_NAME = 'chat-agent'
const BUSY_WARNING = '当前会话正在生成中'
const SELECT_ROLE_WARNING = '请先选择角色'
const QUOTA_EXCEEDED_MESSAGE = '额度不足'

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
  const isSecure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
  const host =
    typeof window !== 'undefined' ? window.location.host : 'localhost:3000'

  return `${isSecure ? 'https' : 'http'}://${host}/agents/${AGENT_NAME}`
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
  const abortSignal = linkedSignal
  const unlink = abortSignal ? () => controller.abort() : null

  activeAbortController = controller

  if (abortSignal && unlink) {
    abortSignal.addEventListener('abort', unlink)
  }

  return {
    signal: controller.signal,
    release() {
      if (abortSignal && unlink) {
        abortSignal.removeEventListener('abort', unlink)
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

  const flushBufferedMessages = () => {
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
      flushBufferedMessages()
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n')
    flushBufferedMessages()
  } finally {
    reader.cancel().catch(() => {})
  }
}

const handleChatEvent = (
  event: ChatServerToClientEvent,
  requestId: string,
) => {
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
    (store.activeRequestId === requestId || store.status !== 'done')
  ) {
    store.setStatus('answering')
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
      store.setStatus('answering')
      store.setActiveRequestId(statusEvent.currentRequestId)
      return

    case 'started':
      store.setStatus(store.status === 'answering' ? 'answering' : 'sending')
      store.setActiveRequestId(statusEvent.requestId)
      return

    case 'sync':
      if (statusEvent.status === 'running') {
        store.setStatus('answering')
        store.setActiveRequestId(statusEvent.requestId ?? store.activeRequestId)
        return
      }

      if (statusEvent.status !== 'idle') {
        store.setStatus('done')
        store.setActiveRequestId(null)
      }
      return

    case 'finished':
      if (
        store.activeRequestId &&
        store.activeRequestId !== statusEvent.requestId
      ) {
        return
      }

      store.setStatus('done')
      store.setActiveRequestId(null)
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
  const sanitizedMessages = stripTransientSearchDataFromMessages(messages)
  const rawTreeSnapshot = useMessageTreeStore
    .getState()
    ._getTreeState() as MessageTreeSnapshot
  const treeSnapshot: MessageTreeSnapshot = {
    ...rawTreeSnapshot,
    messages: stripTransientSearchDataFromMessages(rawTreeSnapshot.messages),
  }

  const conversationHistory: SerializedMessage[] = sanitizedMessages.map(
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

export const startChatRequest = async ({ messages }: StartRequestPayload) => {
  const requestStore = useChatRequestStore.getState()
  if (requestStore.status !== 'done') {
    return
  }

  if (!requestStore.currentRole) {
    toast.warning(SELECT_ROLE_WARNING)
    return
  }

  let conversationId = useMessageTreeStore.getState().conversationId
  const requestId = generateId('msg')

  if (!conversationId) {
    conversationId = generateId('conv')
    const now = new Date().toISOString()

    useMessageTreeStore.getState().setConversationId(conversationId)
    useConversationsStore.getState().addConversation({
      id: conversationId,
      title: 'New Chat',
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    })
    appNavigate(`/app/c/${conversationId}`)
  }

  const body = buildPreparedRequest(
    conversationId,
    requestStore.currentRole,
    requestStore.currentPrompt || undefined,
    requestId,
    messages,
  )

  const { signal, release } = replaceActiveAbortController()
  requestStore.setStatus('sending')
  requestStore.setActiveRequestId(requestId)
  requestStore.setConnectionState('connected')

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
      useChatRequestStore.getState().clearRequestState()
      return
    }

    await consumeStreamResponse(response, signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    useChatRequestStore.getState().clearRequestState()
  } finally {
    release()
  }
}

export const stopActiveChatRequest = () => {
  const conversationId = useMessageTreeStore.getState().conversationId
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

  useChatRequestStore.getState().clearRequestState()
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
    return
  }

  if (agentStatus.status !== 'running') {
    return
  }

  const requestStore = useChatRequestStore.getState()
  requestStore.setStatus('answering')
  requestStore.setActiveRequestId(agentStatus.requestId ?? null)
  requestStore.setConnectionState('connected')

  const activeRequest = replaceActiveAbortController(signal)

  try {
    const response = await fetch(
      `${resolveAgentBaseUrl()}/${conversationId}/events?lastEventId=${eventCursor.value}`,
      {
        credentials: 'include',
        signal: activeRequest.signal,
      },
    )

    await consumeStreamResponse(response, activeRequest.signal)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      useChatRequestStore.getState().clearRequestState()
    }
  } finally {
    activeRequest.release()
  }
}
