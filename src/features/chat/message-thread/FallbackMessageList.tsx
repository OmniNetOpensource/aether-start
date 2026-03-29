import { useChatSessionStore } from '@/features/conversations/session';

export function FallbackMessageList() {
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const messages = useChatSessionStore((state) => state.messages);

  return (
    <div className='relative h-full w-full'>
      <div className='h-full w-full overflow-y-auto'>
        <div
          role='log'
          aria-live='polite'
          className='mx-auto flex min-h-0 flex-1 flex-col px-1 pb-[80vh] w-[90%] @[921px]:w-[60%]'
        >
          {currentPath.map((messageId) => {
            const message = messages[messageId - 1];
            if (!message) {
              return null;
            }

            const lines = message.blocks.flatMap((block) => {
              if (block.type === 'content') {
                return [block.content];
              }

              if (block.type === 'error') {
                return [block.message];
              }

              return [];
            });

            if (lines.length === 0) {
              return null;
            }

            const isUser = message.role === 'user';

            return (
              <div key={message.id} className='w-full py-10'>
                <div className={`w-full ${isUser ? 'ml-auto max-w-[90%]' : ''}`}>
                  <div
                    className={
                      isUser
                        ? 'rounded-lg bg-(--surface-muted) px-4 py-3 text-base leading-relaxed text-foreground whitespace-pre-wrap wrap-anywhere'
                        : 'text-base leading-relaxed text-(--text-secondary) whitespace-pre-wrap wrap-anywhere'
                    }
                  >
                    {lines.join('\n\n')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
