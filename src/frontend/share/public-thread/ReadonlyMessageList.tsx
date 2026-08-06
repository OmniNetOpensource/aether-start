import { AlertCircle } from '@/frontend/design-system/icons';
import Markdown from '@/frontend/design-system/Markdown';
import { AttachmentStack } from '@/frontend/attachments/attachment-preview';
import { AskUserQuestionsCard } from '@/frontend/chat/ask-user-questions';
import { ResearchBlock } from '@/frontend/chat/research';
import type { Message } from '@/shared/chat/message';
import { For } from 'solid-js';

type ReadonlyMessageListProps = {
  messages: Message[];
  isPhone?: boolean;
};

export function ReadonlyMessageList(props: ReadonlyMessageListProps) {
  const listWidthClass = () =>
    props.isPhone ? 'mx-auto w-full px-1' : 'mx-auto w-[90%] md:w-[70%] lg:w-[58%] px-1';

  return (
    <div
      role='log'
      aria-live='polite'
      class={`flex min-h-0 w-full flex-col font-serif ${listWidthClass()}`.trim()}
    >
      <For each={props.messages}>
        {(message) => {
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
            <div data-message-id={message.id} data-role={message.role} class='w-full py-10'>
              <div class='w-full min-w-0 flex flex-col items-start text-left'>
                <div class={isUser ? 'w-full max-w-[90%] ml-auto' : 'w-full'}>
                  {shouldRenderBody &&
                    (isUser ? (
                      <div class='rounded-lg bg-muted px-4 py-3'>
                        <AttachmentStack items={attachments} quotes={quotes} />
                        <div class='text-base leading-relaxed text-foreground whitespace-pre-wrap wrap-anywhere'>
                          {contentBlocks.map((block) => block.content).join('\n\n')}
                        </div>
                      </div>
                    ) : (
                      <div class='flex min-w-0 w-full flex-col space-y-3 text-base leading-relaxed text-secondary wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                        <For each={assistantBlocks}>
                          {(block) => {
                            if (block.type === 'research') {
                              return (
                                <div class='not-italic'>
                                  <ResearchBlock items={block.items} />
                                </div>
                              );
                            }

                            if (block.type === 'ask_user_questions') {
                              return <AskUserQuestionsCard block={block} readonly />;
                            }

                            if (block.type === 'error') {
                              return (
                                <div class='flex items-start gap-2 rounded-lg border border-destructive bg-destructive-muted px-3 py-2 text-sm text-destructive not-italic'>
                                  <AlertCircle class='mt-0.5 h-4 w-4 shrink-0' />
                                  <div class='flex-1 whitespace-pre-wrap'>{block.message}</div>
                                </div>
                              );
                            }

                            if (block.type !== 'content') return null;
                            return <Markdown content={block.content} />;
                          }}
                        </For>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
