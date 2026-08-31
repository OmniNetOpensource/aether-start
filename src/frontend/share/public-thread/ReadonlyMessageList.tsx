import { AlertCircle } from '@/frontend/design-system/icons';
import Markdown from '@/frontend/design-system/Markdown';
import { AttachmentStack } from '@/frontend/attachments/attachment-preview';
import { AskUserQuestionsCard } from '@/frontend/chat/ask-user-questions';
import { ResearchBlock } from '@/frontend/chat/research';
import type { Message } from '@/shared/chat/message';

type ReadonlyMessageListProps = {
  messages: Message[];
  isPhone?: boolean;
};

export function ReadonlyMessageList(props: ReadonlyMessageListProps) {
  const listWidthClass = props.isPhone
    ? 'mx-auto w-full px-1'
    : 'mx-auto w-[90%] md:w-[70%] lg:w-[58%] px-1';

  return (
    <div
      role='log'
      aria-live='polite'
      className={`flex min-h-0 w-full flex-col font-serif ${listWidthClass}`.trim()}
    >
      {props.messages.map((message) => {
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
                    <div className='rounded-lg bg-muted px-4 py-3'>
                      <AttachmentStack items={attachments} quotes={quotes} />
                      <div className='text-base leading-relaxed text-foreground whitespace-pre-wrap wrap-anywhere'>
                        {contentBlocks.map((block) => block.content).join('\n\n')}
                      </div>
                    </div>
                  ) : (
                    <div className='flex min-w-0 w-full flex-col space-y-3 text-base leading-relaxed text-secondary wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                      {assistantBlocks.map((block, index) => {
                        if (block.type === 'research') {
                          return (
                            <div key={index} className='not-italic'>
                              <ResearchBlock items={block.items} />
                            </div>
                          );
                        }

                        if (block.type === 'ask_user_questions') {
                          return <AskUserQuestionsCard key={block.callId} block={block} readonly />;
                        }

                        if (block.type === 'error') {
                          return (
                            <div
                              key={index}
                              className='flex items-start gap-2 rounded-lg border border-destructive bg-destructive-muted px-3 py-2 text-sm text-destructive not-italic'
                            >
                              <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                              <div className='flex-1 whitespace-pre-wrap'>{block.message}</div>
                            </div>
                          );
                        }

                        if (block.type !== 'content') return null;
                        return <Markdown key={index} content={block.content} />;
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
