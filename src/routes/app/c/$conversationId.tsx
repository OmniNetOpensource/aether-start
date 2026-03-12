import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '@/features/chat/components/composer/Composer'
import { MessageList } from '@/features/chat/components/message/MessageList'
import {
  resetLastEventId,
  resumeRunningConversation,
} from '@/features/chat/lib/api/chat-orchestrator'
import { useChatRequestStore } from '@/features/chat/store/useChatRequestStore'
import { useConversationLoader } from '@/features/sidebar/hooks/useConversationLoader'
import { useChatSessionStore } from '@/features/sidebar/store/useChatSessionStore'

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
})

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]

export function ConversationPage() {
  const { conversationId } = Route.useParams()
  const { isLoading } = useConversationLoader(conversationId)
  const conversations = useChatSessionStore((state) => state.conversations)
  const title = conversations.find((item) => item.id === conversationId)?.title

  useEffect(() => {
    const defaultTitle = 'Aether'

    if (title) {
      const truncatedTitle =
        title.length > 50 ? `${title.slice(0, 50)}...` : title
      document.title = `${truncatedTitle} - Aether`
    } else {
      document.title = defaultTitle
    }

    return () => {
      document.title = defaultTitle
    }
  }, [title])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    const abortController = new AbortController()

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const connectSseStream = (markConnecting = false) => {
      const { connectionState, setConnectionState } =
        useChatRequestStore.getState()

      if (abortController.signal.aborted || connectionState === 'connecting') {
        return
      }

      if (markConnecting) {
        setConnectionState('connecting')
      }

      resumeRunningConversation(conversationId, abortController.signal).catch(
        () => {},
      )
    }

    const syncReconnect = () => {
      clearReconnectTimer()

      const { connectionState, requestPhase } = useChatRequestStore.getState()
      if (
        requestPhase === 'done' ||
        connectionState === 'idle' ||
        connectionState === 'connected'
      ) {
        reconnectAttempt = 0
        return
      }

      if (connectionState !== 'disconnected') {
        return
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return
      }

      const delay =
        RECONNECT_DELAYS_MS[
          Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
        ]

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        reconnectAttempt += 1
        connectSseStream(true)
      }, delay)
    }

    const handleOffline = () => {
      clearReconnectTimer()
      const { requestPhase, setConnectionState } =
        useChatRequestStore.getState()
      if (requestPhase === 'done') {
        return
      }
      setConnectionState('disconnected')
    }

    const handleOnline = () => {
      clearReconnectTimer()
      const { connectionState, requestPhase } = useChatRequestStore.getState()
      if (requestPhase === 'done' || connectionState === 'connecting') {
        return
      }
      connectSseStream(true)
    }

    const unsubscribeRequestState = useChatRequestStore.subscribe(syncReconnect)

    syncReconnect()
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      unsubscribeRequestState()
      clearReconnectTimer()
      reconnectAttempt = 0
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      abortController.abort()
      resetLastEventId()
      useChatRequestStore.getState().clearRequestState()
      useChatRequestStore.getState().setConnectionState('idle')
    }
  }, [conversationId])

  if (isLoading) {
    return null
  }

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <MessageList />
          <Composer />
        </div>
      </main>
    </div>
  )
}
