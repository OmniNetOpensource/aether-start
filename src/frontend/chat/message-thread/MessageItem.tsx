import { AskUserQuestionsCard } from '@/frontend/chat/ask-user-questions';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from '@/frontend/design-system/Markdown';
import type { Message } from '@/shared/chat/message';
import { ResearchBlock } from '../research/ResearchBlock';
import {
  Copy,
  Check,
  AlertCircle,
  GitBranch,
  Pencil,
  RotateCcw,
} from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { useToast } from '@/frontend/app-shell/useToast';
import { submitToolAnswer } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatState, useChatStatus } from '@/frontend/chat/agent-runtime/chat-state';
import {
  navigateMessageBranch,
  useIsAssistantStreaming,
  useMessage,
  useMessageBranchInfo,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import type { BranchInfo } from '@/shared/chat/message';
import type { EditingState } from './editing-state';
import { MessageEditor } from './MessageEditor';
import { BranchNavigator } from './BranchNavigator';
import { ContentChip } from '@/frontend/chat/composer/composer-editor/ContentChip';
import { consumeNewMessageAnimation } from './message-entry-animation';
import { enhanceServerErrorMessage } from './error-message';

type CopyButtonProps = {
  blocks: Message['blocks'];
};

const CopyButton = (props: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    let text = props.blocks
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
      resetTimer.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={handleCopy}
      className='text-2xs text-muted-foreground'
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

const ActionButton = (props: ActionButtonProps) => (
  <Button
    type='button'
    variant='ghost'
    size='sm'
    onClick={props.onClick}
    disabled={props.disabled}
    className='text-2xs text-muted-foreground'
    title={props.title}
  >
    {props.icon}
  </Button>
);

type MessageItemProps = {
  depth: number;
  isStreaming?: boolean;
  isLastInPath: boolean;
  branchInfo?: BranchInfo | null;
  editingState: EditingState | null;
  onStartEditing: (messageId: number) => void;
  onEditDocumentChange: (document: EditingState['editedDocument']) => void;
  onCancelEditing: () => void;
  onSubmitEdit: () => Promise<void>;
  onRetry: (messageId: number) => Promise<void>;
  onBranch: (messageId: number) => Promise<void>;
} & ({ message: Message; messageId?: undefined } | { message?: undefined; messageId: number });

const formatMessageTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function MessageItem(props: MessageItemProps) {
  const toast = useToast();
  const messageId = props.message ? props.message.id : props.messageId;
  const subscribedMessage = useMessage(messageId);
  const subscribedBranchInfo = useMessageBranchInfo(messageId);
  const subscribedIsStreaming = useIsAssistantStreaming(messageId);
  const status = useChatStatus();
  const message = props.message ?? subscribedMessage;
  const branchInfo = props.branchInfo === undefined ? subscribedBranchInfo : props.branchInfo;
  const isStreaming = props.isStreaming ?? subscribedIsStreaming;
  const editingState = props.editingState?.messageId === messageId ? props.editingState : null;
  const isEditing = editingState !== null;
  const isBusy = status !== 'idle';

  const handleStartEditing = () => props.onStartEditing(messageId);

  const handleRetry = () => {
    void props.onRetry(messageId).catch((error) => {
      console.error('Failed to retry message:', error);
      toast.error(error instanceof Error ? error.message : '重新生成失败');
    });
  };

  const handleBranch = () => {
    void props.onBranch(messageId).catch((error) => {
      console.error('Failed to branch conversation:', error);
      toast.error(error instanceof Error ? error.message : '创建分支会话失败');
    });
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    navigateMessageBranch(messageId, props.depth, direction);
  };

  const isUser = message?.role === 'user';

  /* 新消息挂载时在最终位置淡入并轻微缩放，避免带动视口产生位移感 */
  const bubble = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isUser || !bubble.current || !consumeNewMessageAnimation(messageId)) return;
    if (typeof bubble.current.animate !== 'function') return;
    bubble.current.animate(
      [
        { transform: 'scale(0.96)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 180, easing: 'ease-out' },
    );
  }, [isUser, messageId]);

  if (!message) return null;

  const assistantBlocks = !isUser ? message.blocks : [];
  const shouldRenderBody = isEditing || !isUser || message.blocks.length > 0;
  const contentWidthClass = isUser ? 'w-full max-w-[90%]' : 'w-full';
  const shouldShowToolbar = !isEditing && (isUser || !isStreaming);
  const timeLabel = isUser
    ? formatMessageTime(message.createdAt)
    : message.completedAt
      ? formatMessageTime(message.completedAt)
      : null;

  return (
    <div data-message-id={messageId} data-role={message.role} className='w-full py-10'>
      <div className='w-full min-w-0 flex flex-col items-start text-left'>
        <div className={`${contentWidthClass} ${isUser ? 'ml-auto' : ''}`}>
          {shouldRenderBody && (
            <>
              {isEditing ? (
                editingState ? (
                  <MessageEditor
                    messageId={messageId}
                    document={editingState.editedDocument}
                    onDocumentChange={props.onEditDocumentChange}
                    onCancel={props.onCancelEditing}
                    onSubmit={props.onSubmitEdit}
                  />
                ) : null
              ) : isUser ? (
                <div
                  ref={bubble}
                  className='relative z-10 overflow-visible rounded-lg bg-muted px-4 py-3'
                >
                  <div className='text-base leading-relaxed text-foreground whitespace-pre-wrap wrap-anywhere'>
                    {message.blocks.map((block, blockIndex) => {
                      if (block.type === 'content') {
                        return (
                          <span key={blockIndex}>
                            {message.blocks[blockIndex - 1]?.type === 'content' ? '\n\n' : null}
                            {block.content}
                          </span>
                        );
                      }

                      if (block.type === 'quotes') {
                        return (
                          <Fragment key={blockIndex}>
                            {block.quotes.map((quote) => (
                              <ContentChip
                                key={quote.id}
                                kind='quote'
                                text={quote.text}
                                className='mx-1 max-w-[calc(100%-0.5rem)]'
                              />
                            ))}
                          </Fragment>
                        );
                      }

                      if (block.type !== 'attachments') return null;
                      return (
                        <Fragment key={blockIndex}>
                          {block.attachments.map((attachment) => (
                            <ContentChip
                              key={attachment.id}
                              kind='attachment'
                              name={attachment.name}
                              size={attachment.size}
                              mimeType={attachment.mimeType}
                              url={attachment.url}
                              className='mx-1 max-w-[calc(100%-0.5rem)]'
                            />
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className='flex flex-col space-y-3 min-w-0 w-full text-base leading-relaxed text-secondary wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                  {assistantBlocks.map((block, blockIndex) => {
                    if (block.type === 'research') {
                      return (
                        <div key={blockIndex} className='not-italic'>
                          <ResearchBlock items={block.items} />
                        </div>
                      );
                    }

                    if (block.type === 'ask_user_questions') {
                      return (
                        <AskUserQuestionsCard
                          key={block.callId}
                          block={block}
                          readonly={
                            !(
                              props.isLastInPath &&
                              blockIndex === assistantBlocks.length - 1 &&
                              status === 'idle'
                            )
                          }
                          onSubmit={(answers) => submitToolAnswer(chatState, block.callId, answers)}
                        />
                      );
                    }

                    if (block.type === 'error') {
                      return (
                        <div
                          key={blockIndex}
                          className='flex items-start gap-2 rounded-lg border border-destructive bg-destructive-muted px-3 py-2 text-sm text-destructive not-italic'
                        >
                          <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                          <div className='flex-1 whitespace-pre-wrap'>
                            {enhanceServerErrorMessage(block.message, block.error)}
                          </div>
                        </div>
                      );
                    }

                    if (block.type !== 'content') return null;
                    return (
                      <Markdown
                        key={blockIndex}
                        content={block.content}
                        isAnimating={isStreaming && blockIndex === assistantBlocks.length - 1}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {timeLabel && <p className='mt-2 text-2xs text-muted-foreground'>{timeLabel}</p>}
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
                <>
                  <ActionButton
                    onClick={handleRetry}
                    disabled={isBusy}
                    title='重试生成'
                    icon={<RotateCcw className='h-3.5 w-3.5' />}
                  />
                  <ActionButton
                    onClick={handleBranch}
                    disabled={isBusy}
                    title='从这里创建分支会话'
                    icon={<GitBranch className='h-3.5 w-3.5' />}
                  />
                </>
              )}
            </div>
          )}
          {branchInfo && !isEditing && (
            <div className='mt-2 flex items-center transition-opacity duration-150 pointer-events-auto'>
              <BranchNavigator branchInfo={branchInfo} onNavigate={handleNavigate} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
