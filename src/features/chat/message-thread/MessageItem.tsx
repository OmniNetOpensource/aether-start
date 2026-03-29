import { AskUserQuestionsCard } from '@/features/chat/ask-user-questions';
import { useState, type ReactNode } from 'react';
import Markdown from '@/shared/design-system/Markdown';
import { Message } from '@/features/chat/message-thread';
import { getBranchInfo as getBranchInfoFn } from '@/features/conversations/conversation-tree';
import { ResearchBlock } from '../research/ResearchBlock';
import { Copy, Check, AlertCircle, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { useChatSessionStore } from '@/features/conversations/session';
import { useChatRequestStore } from '@/features/chat/session';
import { submitToolAnswer } from '@/features/chat/session';
import { useEditingStore } from '@/features/chat/message-thread';
import { MessageEditor } from './MessageEditor';
import { BranchNavigator } from './BranchNavigator';
import { AttachmentStack } from '@/features/attachments/attachment-preview';

type CopyButtonProps = {
  blocks: Message['blocks'];
};

const CopyButton = ({ blocks }: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    let text = blocks
      .filter((b) => b.type === 'content')
      .map((b) => b.content)
      .join('\n\n');

    if (!text) return;

    try {
      try {
        text = decodeURIComponent(text);
      } catch {
        // 非 URL 编码，保持原样
      }
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={handleCopy}
      className='text-2xs text-neutral-500 dark:text-neutral-400'
      title='复制内容'
    >
      {isCopied ? (
        <Check className='h-3.5 w-3.5' strokeWidth={2.5} />
      ) : (
        <Copy className='h-3.5 w-3.5' strokeWidth={2.5} />
      )}
    </Button>
  );
};

type ActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: ReactNode;
};

const ActionButton = ({ onClick, disabled, title, icon }: ActionButtonProps) => (
  <Button
    type='button'
    variant='ghost'
    size='sm'
    onClick={onClick}
    disabled={disabled}
    className='text-2xs text-neutral-500 dark:text-neutral-400'
    title={title}
  >
    {icon}
  </Button>
);

type MessageItemProps = {
  messageId: number;
  index: number;
  depth: number;
  isStreaming: boolean;
};

export function MessageItem({ messageId, index, depth, isStreaming }: MessageItemProps) {
  const messageFromStore = useChatSessionStore((state) => state.messages[messageId - 1]);
  const status = useChatRequestStore((s) => s.status);
  const isEditing = useEditingStore((state) => state.editingState?.messageId === messageId);
  const startEditing = useEditingStore((state) => state.startEditing);
  const retryFromMessage = useEditingStore((state) => state.retryFromMessage);
  const navigateBranch = useChatSessionStore((state) => state.navigateBranch);
  const message = messageFromStore;

  const branchInfo = getBranchInfoFn(useChatSessionStore.getState().messages, messageId);
  const isBusy = status !== 'idle';

  const handleStartEditing = () => startEditing(messageId);

  const handleRetry = () => retryFromMessage(messageId, depth);

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (status === 'idle') {
      navigateBranch(messageId, depth, direction);
    }
  };

  if (!message) return null;
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
    isEditing ||
    !isUser ||
    contentBlocks.length > 0 ||
    quoteBlocks.length > 0 ||
    attachmentBlocks.length > 0;
  const contentWidthClass = isUser ? 'w-full max-w-[90%]' : 'w-full';

  const shouldShowToolbar = !isEditing && (isUser || !isStreaming);

  return (
    <div
      key={`${message.role}-${index}`}
      data-message-id={messageId}
      data-role={message.role}
      className='w-full py-10'
    >
      <div className='w-full min-w-0 flex flex-col items-start text-left'>
        <div className={`${contentWidthClass} ${isUser ? 'ml-auto' : ''}`}>
          {shouldRenderBody && (
            <>
              {isEditing ? (
                <MessageEditor messageId={messageId} depth={depth} />
              ) : isUser ? (
                <div>
                  <AttachmentStack items={attachments} quotes={quotes} />
                  <div className='relative z-10 overflow-visible rounded-lg bg-(--surface-muted) px-4 py-3'>
                    <div className='text-base leading-relaxed text-foreground wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                      {contentBlocks.map((block, blockIndex) => {
                        const blockKey = `${index}-${blockIndex}`;

                        if (block.type === 'content') {
                          return <Markdown key={blockKey} content={block.content} />;
                        }

                        return null;
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className='flex flex-col space-y-3 min-w-0 w-full text-base leading-relaxed text-(--text-secondary) wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
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

                    if (block.type === 'ask_user_questions') {
                      return (
                        <AskUserQuestionsCard
                          key={blockKey}
                          block={block}
                          onSubmit={(answers) => submitToolAnswer(block.callId, answers)}
                        />
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

                    return (
                      <Markdown
                        key={blockKey}
                        content={block.content}
                        isAnimating={isStreaming && blockIndex === assistantBlocks.length - 1}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {shouldShowToolbar && (
            <div className='mt-4 flex items-center transition-opacity duration-150 opacity-100 pointer-events-auto'>
              {isUser && (
                <>
                  <ActionButton
                    onClick={handleStartEditing}
                    disabled={isBusy}
                    title='编辑消息'
                    icon={<Pencil className='h-3.5 w-3.5' strokeWidth={2.5} />}
                  />
                  <ActionButton
                    onClick={handleRetry}
                    disabled={isBusy}
                    title='重试生成'
                    icon={<RotateCcw className='h-3.5 w-3.5' strokeWidth={2.5} />}
                  />
                </>
              )}
              <CopyButton blocks={message.blocks} />
              {!isUser && (
                <ActionButton
                  onClick={handleRetry}
                  disabled={isBusy}
                  title='重试生成'
                  icon={<RotateCcw className='h-3.5 w-3.5' />}
                />
              )}
            </div>
          )}
          {branchInfo && !isEditing && (
            <div className='mt-2 flex items-center transition-opacity duration-150 pointer-events-auto'>
              <BranchNavigator
                branchInfo={branchInfo}
                onNavigate={handleNavigate}
                disabled={isBusy}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
