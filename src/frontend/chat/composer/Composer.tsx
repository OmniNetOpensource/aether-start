import { createEffect, createSignal, createUniqueId } from 'solid-js';
import { useHydrated, useNavigate } from '@tanstack/solid-router';
import { ArrowUp, Loader2, Paperclip, Square } from '@/frontend/design-system/icons';
import { cancelAnswering, cancelSending } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatRuntime, status } from '@/frontend/chat/agent-runtime/chat-runtime';
import { useMountEffect } from '@/frontend/app-shell/useMountEffect';
import { useToast } from '@/frontend/app-shell/useToast';
import { Button } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import { FetchProviderSelector } from './composer-controls/FetchProviderSelector';
import { ModelSelector } from './composer-controls/ModelSelector';
import { PromptSelector } from './composer-controls/PromptSelector';
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
  const [composerDocumentState, setComposerDocument] = createSignal<ComposerDocument>();
  const composerDocument = () =>
    composerDocumentState() ??
    createComposerDocument(hydrated() ? (window.__preHydrationInput ?? '') : '');
  let editor: RichComposerEditorHandle | null = null;
  const fileInputId = createUniqueId();
  const uploading = () => isComposerDocumentUploading(composerDocument());
  const action = () => {
    const currentStatus = status();
    return currentStatus === 'idle'
      ? isComposerDocumentEmpty(composerDocument()) || uploading()
        ? 'disabled'
        : 'send'
      : currentStatus;
  };
  const inputDisabled = () => action() === 'sending';
  const sendDisabled = () => action() === 'disabled' || action() === 'stopping';

  createEffect(
    () => ({ document: composerDocument(), hydrated: hydrated() }),
    ({ document, hydrated }) => {
      if (hydrated) localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, getComposerText(document));
    },
  );

  useMountEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;

      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return;

      event.preventDefault();
      editor?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const submit = () => {
    void submitMessage(
      chatRuntime,
      composerDocument(),
      async (conversationId) => {
        await navigate({
          to: '/app/$conversationId',
          params: { conversationId },
        });
      },
      () => {
        setComposerDocument([]);
        editor?.clear();
      },
    ).catch((error) => {
      console.error('Failed to submit message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    });
  };

  createEffect(
    () => ({ document: composerDocument(), action: action() }),
    ({ document, action }) => {
      if (import.meta.env.DEV) {
        console.log('[Composer]', { document, action });
      }
    },
  );

  const onFilesSelected = async (files: File[]) => {
    if (uploading()) {
      toast.info('Attachments are still uploading. Please wait.');
      return;
    }
    await editor?.insertFiles(files);
  };

  const onAction = () => {
    if (action() === 'stopping') {
      toast.warning('正在停止当前回复，请稍候。');
      return;
    }
    if (action() === 'disabled') {
      submit();
      return;
    }
    if (action() === 'sending') {
      void cancelSending(chatRuntime, 'Composer/sendButton').catch((error) => {
        console.error('Failed to cancel sending:', error);
        toast.error(error instanceof Error ? error.message : '取消发送失败');
      });
      return;
    }
    if (action() === 'streaming') {
      void cancelAnswering(chatRuntime, 'Composer/stopButton').catch((error) => {
        console.error('Failed to stop answering:', error);
        toast.error(error instanceof Error ? error.message : '停止失败');
      });
      return;
    }
    submit();
  };

  return (
    <div class='absolute bottom-[2vh] z-(--z-composer) w-full shrink-0 pb-3 md:pb-4 pointer-events-none'>
      <div
        class='relative bottom-2 mx-auto flex w-[90%] max-w-full flex-col gap-2 @[921px]:w-[50%] @[921px]:max-w-2xl pointer-events-auto'
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = inputDisabled() ? 'none' : 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (inputDisabled()) return;

          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length) void onFilesSelected(files);
        }}
      >
        <div class='liquid-glass relative z-10 flex w-full flex-col gap-2 rounded-xl border p-2 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 focus-within:shadow-md'>
          <div class='flex w-full items-end gap-2'>
            <RichComposerEditor
              ref={(currentEditor) => {
                editor = currentEditor;
                registerActiveInput({ type: 'composer' }, currentEditor);
              }}
              id='message-input'
              document={composerDocument()}
              onChange={setComposerDocument}
              onFocus={() => setLastFocusedInput({ type: 'composer' })}
              onSubmit={submit}
              disabled={inputDisabled()}
              placeholder='Type your message...'
              class={inputDisabled() ? 'cursor-not-allowed' : undefined}
            />
          </div>
          <div class='flex items-center justify-between px-0.5'>
            <div class='flex items-center gap-1'>
              <span
                title={
                  uploading() ? '正在处理图片...' : '添加图片（支持 JPG、PNG、WebP、GIF，最大 4MB）'
                }
              >
                <input
                  id={fileInputId}
                  type='file'
                  multiple
                  onChange={async (event) => {
                    if (inputDisabled() || uploading() || !event.currentTarget.files?.length)
                      return;

                    await onFilesSelected(Array.from(event.currentTarget.files));
                    event.currentTarget.value = '';
                  }}
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  disabled={inputDisabled()}
                  class='sr-only'
                  data-testid='composer-file-input'
                />
                <label
                  for={fileInputId}
                  aria-label={uploading() ? '正在上传附件...' : '添加附件'}
                  aria-disabled={inputDisabled() || uploading() ? 'true' : 'false'}
                  title={uploading() ? '正在上传附件...' : '添加附件'}
                  data-testid='composer-attachment-trigger'
                  class={cn(
                    'inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:bg-hover hover:!text-foreground',
                    (inputDisabled() || uploading()) && 'pointer-events-none cursor-not-allowed',
                  )}
                >
                  {uploading() ? (
                    <Loader2 class='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Paperclip class='h-3.5 w-3.5' />
                  )}
                </label>
              </span>
              <PromptSelector />
              <FetchProviderSelector />
            </div>

            <div class='flex items-center gap-1'>
              <ModelSelector />
              <Button
                type='button'
                aria-label='发送'
                onClick={(event) => {
                  if (action() === 'disabled') {
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
                class={cn(
                  'h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200',
                  sendDisabled()
                    ? 'bg-muted text-muted-foreground hover:bg-muted scale-90 cursor-not-allowed'
                    : 'bg-primary text-background hover:bg-primary hover:scale-105 active:scale-95',
                )}
              >
                {action() === 'sending' || action() === 'stopping' ? (
                  <Loader2 class='h-4 w-4 animate-spin' />
                ) : action() === 'streaming' ? (
                  <Square class='h-4 w-4 fill-current' />
                ) : (
                  <ArrowUp
                    class={cn(
                      'h-5 w-5 transition-transform duration-300 ease-out',
                      !sendDisabled() && 'rotate-90',
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
