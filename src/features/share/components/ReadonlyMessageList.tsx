import { AlertCircle } from 'lucide-react';
import Markdown from '@/shared/components/Markdown';
import { AttachmentStack } from '@/features/chat/components/AttachmentStack';
import { ResearchBlock } from '@/features/chat/components/research/ResearchBlock';
import type { Message } from '@/features/chat/types/message';

type ReadonlyMessageListProps = {
  messages: Message[];
  isPhone?: boolean;
};

export function ReadonlyMessageList({ messages, isPhone = false }: ReadonlyMessageListProps) {
  const listWidthClass = isPhone
    ? 'mx-auto w-full px-1'
    : 'mx-auto w-[90%] md:w-[70%] lg:w-[58%] px-1';

  return (
    <div
      role='log'
      aria-live='polite'
      className={`flex min-h-0 w-full flex-col ${listWidthClass}`.trim()}
    >
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        const quoteBlocks = message.blocks.filter(
          (block): block is Extract<Message['blocks'][number], { type: 'quotes' }> =>
            block.type === 'quotes',
        );
        const attachmentBlocks = message.blocks.filter(
          (block): block is Extract<Message['blocks'][number], { type: 'attachments' }> =>
            block.type === 'attachments',
        );
        const contentBlocks = message.blocks.filter((block) => block.type === 'content');
        const assistantBlocks = !isUser ? message.blocks : [];
        const quotes = quoteBlocks.flatMap((block) => block.quotes);
        const attachments = attachmentBlocks.flatMap((block) => block.attachments);
        const shouldRenderBody =
          !isUser ||
          contentBlocks.length > 0 ||
          quoteBlocks.length > 0 ||
          attachmentBlocks.length > 0;

        return (
          <div
            key={message.id}
            data-message-id={message.id}
            data-role={message.role}
            className='w-full py-10'
          >
            <div className='w-full min-w-0 flex flex-col items-start text-left'>
              <div className={isUser ? 'w-full max-w-[90%] ml-auto' : 'w-full'}>
                {shouldRenderBody &&
                  (isUser ? (
                    <div className='rounded-lg bg-(--surface-muted) px-4 py-3'>
                      <AttachmentStack items={attachments} quotes={quotes} />
                      <div className='text-base leading-relaxed text-foreground wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                        {contentBlocks.map((block, blockIndex) =>
                          block.type === 'content' ? (
                            <Markdown key={`${message.id}-${blockIndex}`} content={block.content} />
                          ) : null,
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className='flex min-w-0 w-full flex-col space-y-3 text-base leading-relaxed text-(--text-secondary) wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                      {assistantBlocks.map((block, blockIndex) => {
                        const blockKey = `${index}-${blockIndex}`;

                        if (block.type === 'research') {
                          return (
                            <div key={blockKey} className='not-italic'>
                              <ResearchBlock
                                items={block.items}
                                blockIndex={blockIndex}
                                messageIndex={index}
                              />
                            </div>
                          );
                        }

                        if (block.type === 'error') {
                          return (
                            <div
                              key={blockKey}
                              className='flex items-start gap-2 rounded-lg border border-destructive bg-(--status-destructive-muted) px-3 py-2 text-sm text-destructive not-italic'
                            >
                              <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                              <div className='flex-1 whitespace-pre-wrap'>{block.message}</div>
                            </div>
                          );
                        }

                        return <Markdown key={blockKey} content={block.content} />;
                      })}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
