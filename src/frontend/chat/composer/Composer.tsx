import { useEffect, useId, useRef, useState } from 'react';
import { useHydrated, useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square, X } from '@/frontend/design-system/icons';
import { cancelAnswering, cancelSending } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatState, useChatStatus } from '@/frontend/chat/agent-runtime/chat-state';
import { useToast } from '@/frontend/app-shell/useToast';
import { Button } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import { ModelSelector } from './composer-controls/ModelSelector';
import { registerActiveInput, setLastFocusedInput } from './composer-editor/active-input';
import {
  createComposerDocument,
  getComposerText,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from './composer-editor/composer-document';
import {
  RichComposerEditor,
  type RichComposerEditorHandle,
} from './composer-editor/RichComposerEditor';
import { submitMessage } from './composer-request/submit-chat';
import {
  queuedMessages,
  setQueuedMessages,
  useQueuedMessages,
} from './composer-request/message-queue';
import { markNewMessageAnimation } from '@/frontend/chat/message-thread/message-entry-animation';

declare global {
  interface Window {
    __preHydrationInput?: string;
  }
}

const COMPOSER_DRAFT_STORAGE_KEY = 'aether_composer_draft';

export function Composer() {
  const toast = useToast();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const [composerDocumentState, setComposerDocument] = useState<ComposerDocument>();
  const composerDocument =
    composerDocumentState ??
    createComposerDocument(hydrated ? (window.__preHydrationInput ?? '') : '');
  const editor = useRef<RichComposerEditorHandle | null>(null);
  const fileInputId = useId();
  const status = useChatStatus();
  const queuedMessagesState = useQueuedMessages();
  const uploading = isComposerDocumentUploading(composerDocument);
  const action =
    status === 'idle'
      ? isComposerDocumentEmpty(composerDocument) || uploading
        ? 'disabled'
        : 'send'
      : status;
  const inputDisabled = action === 'sending';
  const sendDisabled = action === 'disabled' || action === 'stopping';

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, getComposerText(composerDocument));
    }
  }, [composerDocument, hydrated]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;

      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return;

      event.preventDefault();
      editor.current?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const send = (messageDocument: ComposerDocument, onAccepted: () => void) => {
    void submitMessage(
      chatState,
      messageDocument,
      async (conversationId) => {
        await navigate({
          to: '/app/$conversationId',
          params: { conversationId },
        });
      },
      onAccepted,
      (response) => markNewMessageAnimation(response.userMessage.id),
    ).catch((error) => {
      console.error('Failed to submit message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    });
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  const submit = () => {
    editor.current?.blur();
    send(composerDocument, () => {
      setComposerDocument([]);
      editor.current?.clear();
      editor.current?.focus();
    });
  };

  /* 流式输出结束回到 idle 后，自动发送队列里的下一条消息 */
  useEffect(() => {
    if (status !== 'idle') return;
    const [next, ...rest] = queuedMessagesState;
    if (!next) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || chatState.getStatus() !== 'idle' || queuedMessages()[0] !== next) return;
      setQueuedMessages(rest);
      sendRef.current(next, () => {});
    });
    return () => {
      cancelled = true;
    };
  }, [queuedMessagesState, status]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Composer]', { document: composerDocument, action });
    }
  }, [action, composerDocument]);

  const onFilesSelected = async (files: File[]) => {
    if (uploading) {
      toast.info('Attachments are still uploading. Please wait.');
      return;
    }
    await editor.current?.insertFiles(files);
  };

  const onAction = () => {
    if (action === 'stopping') {
      toast.warning('正在停止当前回复，请稍候。');
      return;
    }
    if (action === 'disabled') {
      submit();
      return;
    }
    if (action === 'sending') {
      void cancelSending(chatState, 'Composer/sendButton').catch((error) => {
        console.error('Failed to cancel sending:', error);
        toast.error(error instanceof Error ? error.message : '取消发送失败');
      });
      return;
    }
    if (action === 'streaming') {
      void cancelAnswering(chatState, 'Composer/stopButton').catch((error) => {
        console.error('Failed to stop answering:', error);
        toast.error(error instanceof Error ? error.message : '停止失败');
      });
      return;
    }
    submit();
  };

  return (
    <div className='absolute bottom-[2vh] z-(--z-composer) w-full shrink-0 pb-3 md:pb-4 pointer-events-none'>
      <div
        className='relative bottom-2 mx-auto flex w-[90%] max-w-full flex-col gap-2 @[921px]:w-[50%] @[921px]:max-w-2xl pointer-events-auto'
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = inputDisabled ? 'none' : 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (inputDisabled) return;

          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length) void onFilesSelected(files);
        }}
      >
        {queuedMessagesState.map((queued, index) => (
          <div
            key={index}
            className='liquid-glass pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-xl'
          >
            <span className='min-w-0 flex-1 truncate'>
              {getComposerText(queued).trim() || '（附件）'}
            </span>
            <button
              type='button'
              aria-label='取消排队消息'
              onClick={() => setQueuedMessages((queue) => queue.filter((_, i) => i !== index))}
              className='shrink-0 rounded-full p-0.5 hover:bg-hover'
            >
              <X className='h-3.5 w-3.5' />
            </button>
          </div>
        ))}
        <div className='liquid-glass relative z-10 flex w-full flex-col gap-2 rounded-xl border p-2 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 focus-within:shadow-md'>
          <div className='flex w-full items-end gap-2'>
            <RichComposerEditor
              ref={(currentEditor) => {
                editor.current = currentEditor;
                registerActiveInput({ type: 'composer' }, currentEditor);
              }}
              id='message-input'
              document={composerDocument}
              onChange={setComposerDocument}
              onFocus={() => setLastFocusedInput({ type: 'composer' })}
              onSubmit={submit}
              disabled={inputDisabled}
              ariaLabel='Message input'
              className={inputDisabled ? 'cursor-not-allowed' : undefined}
            />
          </div>
          <div className='flex items-center justify-between px-0.5'>
            <div className='flex items-center gap-1'>
              <span
                title={
                  uploading ? '正在处理图片...' : '添加图片（支持 JPG、PNG、WebP、GIF，最大 4MB）'
                }
              >
                <input
                  id={fileInputId}
                  type='file'
                  multiple
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    if (inputDisabled || uploading || !input.files?.length) return;

                    await onFilesSelected(Array.from(input.files));
                    input.value = '';
                  }}
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  disabled={inputDisabled}
                  className='sr-only'
                  data-testid='composer-file-input'
                />
                <label
                  htmlFor={fileInputId}
                  aria-label={uploading ? '正在上传附件...' : '添加附件'}
                  aria-disabled={inputDisabled || uploading ? 'true' : 'false'}
                  title={uploading ? '正在上传附件...' : '添加附件'}
                  data-testid='composer-attachment-trigger'
                  className={cn(
                    'inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:bg-hover hover:!text-foreground',
                    (inputDisabled || uploading) && 'pointer-events-none cursor-not-allowed',
                  )}
                >
                  {uploading ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Paperclip className='h-3.5 w-3.5' />
                  )}
                </label>
              </span>
            </div>

            <div className='flex items-center gap-1'>
              <ModelSelector />
              <Button
                type='button'
                aria-label='发送'
                onClick={(event) => {
                  if (action === 'disabled') {
                    event.currentTarget.animate(
                      [
                        { transform: 'translateX(0) scale(1)' },
                        { transform: 'translateX(-5px) scale(0.98)' },
                        { transform: 'translateX(5px) scale(0.98)' },
                        { transform: 'translateX(-4px) scale(0.985)' },
                        { transform: 'translateX(4px) scale(0.985)' },
                        { transform: 'translateX(-2px) scale(0.99)' },
                        { transform: 'translateX(2px) scale(0.99)' },
                        { transform: 'translateX(0) scale(1)' },
                      ],
                      {
                        duration: 440,
                        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
                      },
                    );
                  }
                  onAction();
                }}
                size='icon'
                data-testid='composer-send-button'
                className={cn(
                  'h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200',
                  sendDisabled
                    ? 'bg-muted text-muted-foreground hover:bg-muted scale-90 cursor-not-allowed'
                    : 'bg-primary text-background hover:bg-primary hover:scale-105 active:scale-95',
                )}
              >
                {action === 'sending' || action === 'stopping' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : action === 'streaming' ? (
                  <Square className='h-4 w-4 fill-current' />
                ) : (
                  <ArrowUp
                    className={cn(
                      'h-5 w-5 transition-transform duration-300 ease-out',
                      !sendDisabled && 'rotate-90',
                    )}
                  />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
