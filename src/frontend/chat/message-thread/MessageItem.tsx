import { AskUserQuestionsCard } from '@/frontend/chat/ask-user-questions';
import { createSignal, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import Markdown from '@/frontend/design-system/Markdown';
import type { Message } from '@/shared/chat/message';
import { ResearchBlock } from '../research/ResearchBlock';
import { Copy, Check, AlertCircle, Pencil, RotateCcw } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { useToast } from '@/frontend/app-shell/useToast';
import { submitToolAnswer } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatState, status } from '@/frontend/chat/agent-runtime/chat-state';
import { navigateMessageBranch } from '@/frontend/conversations/conversation-tree/message-tree-state';
import type { BranchInfo } from '@/shared/chat/message';
import type { EditingState } from './editing-state';
import { MessageEditor } from './MessageEditor';
import { BranchNavigator } from './BranchNavigator';
import { ContentChip } from '@/frontend/chat/composer/composer-editor/ContentChip';

type CopyButtonProps = {
  blocks: Message['blocks'];
};

const CopyButton = (props: CopyButtonProps) => {
  const [isCopied, setIsCopied] = createSignal(false);

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
      class='text-2xs text-muted-foreground'
      title='复制内容'
    >
      {isCopied() ? (
        <Check class='h-3.5 w-3.5' stroke-width={2.5} />
      ) : (
        <Copy class='h-3.5 w-3.5' stroke-width={2.5} />
      )}
    </Button>
  );
};

type ActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: JSX.Element;
};

const ActionButton = (props: ActionButtonProps) => (
  <Button
    type='button'
    variant='ghost'
    size='sm'
    onClick={props.onClick}
    disabled={props.disabled}
    class='text-2xs text-muted-foreground'
    title={props.title}
  >
    {props.icon}
  </Button>
);

type MessageItemProps = {
  message: Message;
  depth: number;
  isStreaming: boolean;
  isLastInPath: boolean;
  branchInfo: BranchInfo | null;
  editingState: EditingState | null;
  onStartEditing: (messageId: number) => void;
  onEditDocumentChange: (document: EditingState['editedDocument']) => void;
  onCancelEditing: () => void;
  onSubmitEdit: () => Promise<void>;
  onRetry: (messageId: number) => Promise<void>;
};

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
  const messageId = () => props.message.id;
  const editingState = () =>
    props.editingState?.messageId === messageId() ? props.editingState : null;
  const isEditing = () => editingState() !== null;
  const isBusy = () => status() !== 'idle';

  const handleStartEditing = () => props.onStartEditing(messageId());

  const handleRetry = () => {
    void props.onRetry(messageId()).catch((error) => {
      console.error('Failed to retry message:', error);
      toast.error(error instanceof Error ? error.message : '重新生成失败');
    });
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (status() === 'idle') {
      navigateMessageBranch(messageId(), props.depth, direction);
    }
  };

  const isUser = () => props.message.role === 'user';
  const assistantBlocks = () => (!isUser() ? props.message.blocks : []);
  const shouldRenderBody = () => isEditing() || !isUser() || props.message.blocks.length > 0;
  const contentWidthClass = () => (isUser() ? 'w-full max-w-[90%]' : 'w-full');
  const shouldShowToolbar = () => !isEditing() && (isUser() || !props.isStreaming);
  const timeLabel = () =>
    isUser()
      ? formatMessageTime(props.message.createdAt)
      : props.message.completedAt
        ? formatMessageTime(props.message.completedAt)
        : null;

  return (
    <div data-message-id={messageId()} data-role={props.message.role} class='w-full py-10'>
      <div class='w-full min-w-0 flex flex-col items-start text-left'>
        <div class={`${contentWidthClass()} ${isUser() ? 'ml-auto' : ''}`}>
          {shouldRenderBody() && (
            <>
              {isEditing() ? (
                <Show when={editingState()}>
                  {(editing) => (
                    <MessageEditor
                      messageId={messageId()}
                      document={editing().editedDocument}
                      onDocumentChange={props.onEditDocumentChange}
                      onCancel={props.onCancelEditing}
                      onSubmit={props.onSubmitEdit}
                    />
                  )}
                </Show>
              ) : isUser() ? (
                <div class='relative z-10 overflow-visible rounded-lg bg-muted px-4 py-3'>
                  <div class='text-base leading-relaxed text-foreground whitespace-pre-wrap wrap-anywhere'>
                    <For each={props.message.blocks}>
                      {(block, blockIndex) => {
                        if (block.type === 'content') {
                          return (
                            <span>
                              {props.message.blocks[blockIndex() - 1]?.type === 'content'
                                ? '\n\n'
                                : null}
                              {block.content}
                            </span>
                          );
                        }

                        if (block.type === 'quotes') {
                          return (
                            <For each={block.quotes}>
                              {(quote) => (
                                <ContentChip kind='quote' text={quote.text} class='mx-1' />
                              )}
                            </For>
                          );
                        }

                        if (block.type !== 'attachments') return null;
                        return (
                          <For each={block.attachments}>
                            {(attachment) => (
                              <ContentChip
                                kind='attachment'
                                name={attachment.name}
                                size={attachment.size}
                                mimeType={attachment.mimeType}
                                url={attachment.url}
                                class='mx-1'
                              />
                            )}
                          </For>
                        );
                      }}
                    </For>
                  </div>
                </div>
              ) : (
                <div class='flex flex-col space-y-3 min-w-0 w-full text-base leading-relaxed text-secondary wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal'>
                  <For each={assistantBlocks()}>
                    {(block, blockIndex) => {
                      if (block.type === 'research') {
                        return (
                          <div class='not-italic'>
                            <ResearchBlock items={block.items} />
                          </div>
                        );
                      }

                      if (block.type === 'ask_user_questions') {
                        const isLastBlock = blockIndex() === assistantBlocks().length - 1;
                        const isUsable = props.isLastInPath && isLastBlock && status() === 'idle';
                        return (
                          <AskUserQuestionsCard
                            block={block}
                            readonly={!isUsable}
                            onSubmit={(answers) =>
                              submitToolAnswer(chatState, block.callId, answers)
                            }
                          />
                        );
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
                      return (
                        <Markdown
                          content={block.content}
                          isAnimating={
                            props.isStreaming && blockIndex() === assistantBlocks().length - 1
                          }
                        />
                      );
                    }}
                  </For>
                </div>
              )}
            </>
          )}

          {timeLabel() && <p class='mt-2 text-2xs text-muted-foreground'>{timeLabel()}</p>}
          {shouldShowToolbar() && (
            <div class='mt-4 flex items-center transition-opacity duration-150 opacity-100 pointer-events-auto'>
              {isUser() && (
                <>
                  <ActionButton
                    onClick={handleStartEditing}
                    title='编辑消息'
                    icon={<Pencil class='h-3.5 w-3.5' stroke-width={2.5} />}
                  />
                  <ActionButton
                    onClick={handleRetry}
                    title='重试生成'
                    icon={<RotateCcw class='h-3.5 w-3.5' stroke-width={2.5} />}
                  />
                </>
              )}
              <CopyButton blocks={props.message.blocks} />
              {!isUser() && (
                <ActionButton
                  onClick={handleRetry}
                  title='重试生成'
                  icon={<RotateCcw class='h-3.5 w-3.5' />}
                />
              )}
            </div>
          )}
          {props.branchInfo && !isEditing() && (
            <div class='mt-2 flex items-center transition-opacity duration-150 pointer-events-auto'>
              <BranchNavigator
                branchInfo={props.branchInfo}
                onNavigate={handleNavigate}
                disabled={isBusy()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
