import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '@/components/chat/composer/Composer'
import { MessageList } from '@/components/chat/message/MessageList'
import { useConversationLoader } from '@/hooks/useConversationLoader'
import { useConversationsStore } from '@/stores/useConversationsStore'
import { useChatRequestStore } from '@/stores/useChatRequestStore'

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
})

function ConversationPage() {
  const { conversationId } = Route.useParams()
  const { isLoading } = useConversationLoader(conversationId)

  const title = useConversationsStore(
    (state) => state.conversations.find((c) => c.id === conversationId)?.title
  )

  useEffect(() => {
    const defaultTitle = 'Aether'

    if (title) {
      const truncatedTitle = title.length > 50 ? `${title.slice(0, 50)}...` : title
      document.title = `${truncatedTitle} - Aether`
    } else {
      document.title = defaultTitle
    }

    return () => {
      document.title = defaultTitle
    }
  }, [title])

  // Dispose connection when leaving this conversation page
  useEffect(() => {
    const handlePageHide = () => {
      useChatRequestStore.getState().disposeConnection()
    }

    const handleBeforeUnload = () => {
      useChatRequestStore.getState().disposeConnection()
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Also dispose on component unmount (route change)
      useChatRequestStore.getState().disposeConnection()
    }
  }, [])

  if (isLoading) {
    return null
  }

  return (
    <div className='flex h-full w-full flex-col'>
      <main className='relative flex min-h-0 flex-1'>
        <div className='relative flex min-w-0 flex-1 flex-col'>
          <MessageList />
          <Composer />
        </div>
      </main>
    </div>
  )
}
