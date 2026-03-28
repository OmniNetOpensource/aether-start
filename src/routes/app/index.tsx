import { createFileRoute } from '@tanstack/react-router';
import { MessageList } from '@/features/chat/message-thread';
import { useChatRequestStore } from '@/features/chat/session';
import { useEditingStore } from '@/features/chat/message-thread';
import { useChatSessionStore } from '@/features/conversations/session';

function initNewChatPage() {
  if (typeof window === 'undefined') return;

  useChatRequestStore.getState().setStatus('idle', 'new_chat/enter');
  useEditingStore.getState().clear();
  useChatSessionStore.getState().clearSession();
}

export const Route = createFileRoute('/app/')({
  beforeLoad: initNewChatPage,
  component: HomePage,
});

function Greeting() {
  return (
    <div className='flex h-full w-full items-center justify-center pb-[20vh]'>
      <div className='flex items-center gap-1 sm:gap-2 text-2xl sm:text-3xl font-medium text-muted-foreground'>
        <span>今天想</span>
        <div className='relative h-[1.2em] overflow-hidden text-foreground'>
          <div
            className='flex flex-col'
            style={{ animation: 'scrollUp 12s cubic-bezier(0.4,0,0.2,1) infinite' }}
          >
            <span className='flex h-[1.2em] items-center'>探索</span>
            <span className='flex h-[1.2em] items-center'>创造</span>
            <span className='flex h-[1.2em] items-center'>学习</span>
            <span className='flex h-[1.2em] items-center'>发现</span>
            <span className='flex h-[1.2em] items-center'>探索</span>
          </div>
        </div>
        <span>些什么？</span>
      </div>
      <style>{`
        @keyframes scrollUp {
          0%, 20% { transform: translateY(0); }
          25%, 45% { transform: translateY(-1.2em); }
          50%, 70% { transform: translateY(-2.4em); }
          75%, 95% { transform: translateY(-3.6em); }
          100% { transform: translateY(-4.8em); }
        }
      `}</style>
    </div>
  );
}

function HomePage() {
  const messages = useChatSessionStore((state) => state.messages);

  if (messages.length === 0) {
    return <Greeting />;
  }

  return <MessageList />;
}
