import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '@/features/chat/composer/components/Composer'
import { MessageList } from '@/features/chat/messages/components/display/MessageList'
import { useConversationLoader } from '@/features/chat/session/hooks/useConversationLoader'
import { useConversationsStore } from '@/features/conversation/persistence/store/useConversationsStore'

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
})

function ConversationPage() {
  const { conversationId } = Route.useParams()
  const { isLoading } = useConversationLoader(conversationId)

  const conversations = useConversationsStore((state) => state.conversations)

  const currentConversation = conversations.find((conversation) => conversation.id === conversationId)

  useEffect(() => {
    const defaultTitle = 'Aether'
    const title = currentConversation?.title

    if (title) {
      const truncatedTitle = title.length > 50 ? `${title.slice(0, 50)}...` : title
      document.title = `${truncatedTitle} - Aether`
    } else {
      document.title = defaultTitle
    }

    return () => {
      document.title = defaultTitle
    }
  }, [currentConversation?.title])

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
