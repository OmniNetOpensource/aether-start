import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useComposerStore } from '@/features/chat/composer/useComposerStore';
import { getForYouSuggestionsFn } from '@/features/chat/for-you/for-you-suggestions';
import { useChatRequestStore } from '@/features/chat/session';
import { useEditingStore } from '@/features/chat/message-thread/useEditingStore';
import { MessageList } from '@/features/chat/message-thread/MessageList';
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

function Greeting({
  suggestions,
  onPick,
}: {
  suggestions: string[] | null;
  onPick: (text: string) => void;
}) {
  return (
    <div
      className='absolute inset-0 flex flex-col items-center px-4'
      style={{ paddingTop: '28vh' }}
    >
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
      {suggestions && suggestions.length > 0 && (
        <div className='mt-6 flex w-full max-w-2xl flex-col items-center gap-3'>
          <p
            className='text-sm font-medium text-muted-foreground'
            style={{ animation: 'suggestionIn 0.4s ease-out both' }}
          >
            For you
          </p>
          <div className='flex flex-wrap justify-center gap-2'>
            {suggestions.map((text, index) => (
              <button
                key={`${index}-${text}`}
                type='button'
                onClick={() => onPick(text)}
                className='max-w-[min(100%,22rem)] truncate rounded-full border border-border bg-background/60 px-3 py-1.5 text-sm text-foreground transition hover:bg-(--surface-hover)'
                style={{ animation: `suggestionIn 0.4s ease-out ${index * 0.06}s both` }}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @keyframes scrollUp {
          0%, 20% { transform: translateY(0); }
          25%, 45% { transform: translateY(-1.2em); }
          50%, 70% { transform: translateY(-2.4em); }
          75%, 95% { transform: translateY(-3.6em); }
          100% { transform: translateY(-4.8em); }
        }
        @keyframes suggestionIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function HomePage() {
  const messages = useChatSessionStore((state) => state.messages);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  useEffect(() => {
    if (messages.length !== 0) {
      return;
    }

    let cancelled = false;
    void getForYouSuggestionsFn().then((list) => {
      if (!cancelled) {
        setSuggestions(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [messages.length]);

  if (messages.length > 0) {
    return <MessageList />;
  }

  return (
    <Greeting
      suggestions={suggestions}
      onPick={(text) => {
        useComposerStore.getState().setInput(text);
        void Promise.resolve().then(() => {
          document.getElementById('message-input')?.focus();
        });
      }}
    />
  );
}
