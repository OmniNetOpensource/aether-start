import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useHydrated, useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import { cancelAnswering, cancelSending } from '@/features/chat/agent-runtime/chat-orchestrator';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { toast } from '@/shared/app-shell/useToast';
import { Button } from '@/shared/design-system/button';
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
import { useChatRequestStore } from './composer-request/useChatRequestStore';

declare global {
  interface Window {
    __preHydrationInput?: string;
  }
}

const COMPOSER_DRAFT_STORAGE_KEY = 'aether_composer_draft';

type ComposerProps = {
  document: ComposerDocument;
  action: 'disabled' | 'send' | 'sending' | 'streaming' | 'stopping';
  uploading: boolean;
  fileInputId: string;
  promptSelector: ReactNode;
  fetchProviderSelector: ReactNode;
  modelSelector: ReactNode;
  onDocumentChange: (document: ComposerDocument) => void;
  onEditorReady: (editor: RichComposerEditorHandle | null) => void;
  onEditorFocus: () => void;
  onSubmit: () => void;
  onFilesSelected: (files: File[]) => Promise<void>;
  onAction: () => void;
};

export function useComposerProps(): ComposerProps {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const [composerDocumentState, setComposerDocument] = useState<ComposerDocument | null>(null);
  const composerDocument =
    composerDocumentState ??
    createComposerDocument(hydrated ? (window.__preHydrationInput ?? '') : '');
  const editorRef = useRef<RichComposerEditorHandle | null>(null);
  const status = useChatRequestStore((state) => state.status);
  const fileInputId = useId();
  const uploading = isComposerDocumentUploading(composerDocument);
  const action =
    status === 'idle'
      ? isComposerDocumentEmpty(composerDocument) || uploading
        ? 'disabled'
        : 'send'
      : status;

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, getComposerText(composerDocument));
  }, [composerDocument, hydrated]);

  useMountEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;

      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return;

      event.preventDefault();
      editorRef.current?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const submit = () => {
    void submitMessage(
      composerDocument,
      async (conversationId) => {
        await navigate({
          to: '/app/{-$conversationId}',
          params: { conversationId },
        });
      },
      () => {
        setComposerDocument([]);
        editorRef.current?.clear();
      },
    ).catch((error) => {
      console.error('Failed to submit message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    });
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Composer]', { document: composerDocument, action });
    }
  }, [composerDocument, action]);

  return {
    document: composerDocument,
    action,
    uploading,
    fileInputId,
    promptSelector: <PromptSelector />,
    fetchProviderSelector: <FetchProviderSelector />,
    modelSelector: <ModelSelector />,
    onDocumentChange: setComposerDocument,
    onEditorReady: (editor) => {
      editorRef.current = editor;
      registerActiveInput({ type: 'composer' }, editor);
    },
    onEditorFocus: () => setLastFocusedInput({ type: 'composer' }),
    onSubmit: submit,
    onFilesSelected: async (files) => {
      if (uploading) {
        toast.info('Attachments are still uploading. Please wait.');
        return;
      }
      await editorRef.current?.insertFiles(files);
    },
    onAction: () => {
      if (action === 'stopping') {
        toast.warning('正在停止当前回复，请稍候。');
        return;
      }
      if (action === 'disabled') {
        submit();
        return;
      }
      if (action === 'sending') {
        void cancelSending('Composer/sendButton').catch((error) => {
          console.error('Failed to cancel sending:', error);
          toast.error(error instanceof Error ? error.message : '取消发送失败');
        });
        return;
      }
      if (action === 'streaming') {
        void cancelAnswering('Composer/stopButton').catch((error) => {
          console.error('Failed to stop answering:', error);
          toast.error(error instanceof Error ? error.message : '停止失败');
        });
        return;
      }
      submit();
    },
  };
}

export function Composer({
  document,
  action,
  uploading,
  fileInputId,
  promptSelector,
  fetchProviderSelector,
  modelSelector,
  onDocumentChange,
  onEditorReady,
  onEditorFocus,
  onSubmit,
  onFilesSelected,
  onAction,
}: ComposerProps) {
  const inputDisabled = action === 'sending';
  const sendDisabled = action === 'disabled' || action === 'stopping';

  return (
    <div
      key='composer-wrapper'
      className='absolute bottom-[2vh] z-(--z-composer) w-full shrink-0 pb-3 md:pb-4 pointer-events-none'
    >
      <div
        key='composer-bottom'
        className='relative bottom-2 mx-auto flex w-[90%] max-w-full flex-col gap-2 @[921px]:w-[50%] @[921px]:max-w-2xl pointer-events-auto'
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = inputDisabled ? 'none' : 'copy';
        }}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          if (inputDisabled) return;

          const files = Array.from(event.dataTransfer.files);
          if (files.length) void onFilesSelected(files);
        }}
      >
        <div className='liquid-glass relative z-10 flex w-full flex-col gap-2 rounded-xl border p-2 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 focus-within:shadow-md'>
          <div className='flex w-full items-end gap-2'>
            <RichComposerEditor
              ref={onEditorReady}
              id='message-input'
              document={document}
              onChange={onDocumentChange}
              onFocus={onEditorFocus}
              onSubmit={onSubmit}
              disabled={inputDisabled}
              placeholder='Type your message...'
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
                  onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                    if (inputDisabled || uploading || !event.target.files?.length) return;

                    await onFilesSelected(Array.from(event.target.files));
                    event.target.value = '';
                  }}
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  disabled={inputDisabled}
                  className='sr-only'
                  data-testid='composer-file-input'
                />
                <Button
                  asChild
                  variant='ghost'
                  size='sm'
                  className={cn(
                    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground',
                    'disabled:cursor-not-allowed disabled:text-foreground',
                  )}
                >
                  <label
                    htmlFor={fileInputId}
                    aria-label={uploading ? '正在上传附件...' : '添加附件'}
                    aria-disabled={inputDisabled || uploading}
                    title={uploading ? '正在上传附件...' : '添加附件'}
                    data-testid='composer-attachment-trigger'
                    className={cn(
                      'cursor-pointer',
                      (inputDisabled || uploading) && 'pointer-events-none cursor-not-allowed',
                    )}
                  >
                    {uploading ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Paperclip className='h-3.5 w-3.5' />
                    )}
                  </label>
                </Button>
              </span>
              {promptSelector}
              {fetchProviderSelector}
            </div>

            <div className='flex items-center gap-1'>
              {modelSelector}
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
