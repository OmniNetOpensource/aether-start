import {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { toast } from '@/shared/app-shell/useToast';
import { cancelAnswering, cancelSending } from '@/features/chat/agent-runtime/chat-orchestrator';
import { submitMessage } from './submit-chat';
import { cn } from '@/shared/core/utils';
import { useChatRequestStore } from '@/features/chat/composer/useChatRequestStore';
import { ModelSelector } from './ModelSelector';
import { PromptSelector } from './PromptSelector';
import { FetchProviderSelector } from './FetchProviderSelector';
import { useComposerStore } from './useComposerStore';
import { registerActiveInput, useActiveInputStore } from './useActiveInputStore';
import {
  createComposerDocument,
  getComposerText,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
} from './composer-document';
import { RichComposerEditor, type RichComposerEditorHandle } from './RichComposerEditor';

/**
 * 首屏脚本把 localStorage 文本草稿写入 window，hydrate 时再恢复到富文本 store。
 */
declare global {
  interface Window {
    __preHydrationInput?: string;
  }
}

/** localStorage 草稿键：与首屏注入配合，刷新/重进可恢复未发送内容。 */
const COMPOSER_DRAFT_STORAGE_KEY = 'aether_composer_draft';

/**
 * 聊天输入区：文本、引用与图片组成的内联编辑器，以及提示词/模型选择与发送。
 *
 * 发送入口有两处：工具栏主按钮，以及输入框 Ctrl+Enter。
 * 附件有三种入口：文件选择、粘贴图片/文件、拖放到外层容器。
 */
export function Composer() {
  const navigate = useNavigate();

  const composerDocument = useComposerStore((state) => state.document);
  const setDocument = useComposerStore((state) => state.setDocument);
  const setLastFocused = useActiveInputStore((state) => state.setLastFocused);
  const editorRef = useRef<RichComposerEditorHandle | null>(null);
  const uploading = isComposerDocumentUploading(composerDocument);

  // --- 请求状态（发送中/流式中决定主按钮图标与是否视为「忙」）---
  const status = useChatRequestStore((state) => state.status);
  // 隐藏 file input 与 label 关联，避免 id 冲突
  const fileInputId = useId();

  // paint 前把首屏脚本读到的文本草稿写入富文本 store。
  useLayoutEffect(() => {
    const restoredInput = window.__preHydrationInput ?? '';
    if (useComposerStore.getState().document.length === 0 && restoredInput) {
      setDocument(createComposerDocument(restoredInput));
    }

    delete window.__preHydrationInput;
  }, [setDocument]);

  // 输入变化即持久化草稿，便于意外刷新后恢复
  useEffect(() => {
    localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, getComposerText(composerDocument));
  }, [composerDocument]);

  // 在「其它区域」按下可打印字符时，把焦点抢回输入框（不抢已有输入框/快捷键）
  useMountEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.isContentEditable) {
        return;
      }

      event.preventDefault();
      editorRef.current?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  /**
   * 主按钮是否「视觉上禁用」。
   * - 请求进行中（sending/streaming）：按钮可点，用于停止，不设为 disabled。
   * - stopping：已请求服务端停止，等待服务端结束事件。
   * - 其余情况：无内容且无附件、无模型、或正在上传附件时禁用。
   * 草稿在首帧 paint 前由 useLayoutEffect 写入 store，sendDisabled 与受控 input 一致。
   */
  const isBusy = status !== 'idle';
  const inputDisabled = status === 'sending';
  const hasComposerContent = !isComposerDocumentEmpty(composerDocument);
  const sendDisabled = status === 'stopping' || (isBusy ? false : !hasComposerContent || uploading);

  const handleSubmit = () => {
    void submitMessage(
      async (conversationId) => {
        await navigate({
          to: '/app/c/$conversationId',
          params: { conversationId },
        });
      },
      () => editorRef.current?.clear(),
    ).catch((error) => {
      console.error('Failed to submit message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    });
  };

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.log('[Composer]', { document: composerDocument, sendDisabled });
  }, [composerDocument, sendDisabled]);

  return (
    <div
      key='composer-wrapper'
      className='absolute bottom-[2vh] z-(--z-composer) w-full shrink-0 pb-3 md:pb-4 pointer-events-none'
    >
      {/* 最外层：占满主栏宽度、不参与侧栏 flex 收缩，垫高底部留白；z 保证浮在对话内容之上 */}
      <div
        key='composer-bottom'
        className='relative bottom-2 mx-auto flex w-[90%] max-w-full flex-col gap-2 @[921px]:w-[50%] @[921px]:max-w-2xl pointer-events-auto'
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = inputDisabled ? 'none' : 'copy';
        }}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          if (inputDisabled) {
            return;
          }
          const files = Array.from(event.dataTransfer.files ?? []);
          if (!files.length) return;
          if (uploading) {
            toast.info('Attachments are still uploading. Please wait.');
            return;
          }
          void editorRef.current?.insertFiles(files);
        }}
      >
        {/* 输入卡片：文本、引用与图片在同一编辑流内。 */}
        <div className='liquid-glass relative z-10 flex w-full flex-col gap-2 rounded-xl border p-2 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 focus-within:shadow-md'>
          <div className='flex w-full items-end gap-2'>
            <RichComposerEditor
              ref={(editor) => {
                editorRef.current = editor;
                registerActiveInput({ type: 'composer' }, editor);
              }}
              id='message-input'
              document={composerDocument}
              onChange={setDocument}
              onFocus={() => {
                setLastFocused({ type: 'composer' });
              }}
              onSubmit={handleSubmit}
              disabled={inputDisabled}
              placeholder='Type your message...'
              className={inputDisabled ? 'cursor-not-allowed' : undefined}
            />
          </div>
          {/* 工具栏：左右分区 — 左为「附件 + 预设提示词」，右为「模型 + 发送」 */}
          <div className='flex items-center justify-between px-0.5'>
            {/* 左侧工具：隐藏 file input + 回形针触发、PromptSelector */}
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
                    if (inputDisabled || uploading) {
                      return;
                    }

                    const files = event.target.files;
                    if (!files || files.length === 0) {
                      return;
                    }

                    await editorRef.current?.insertFiles(Array.from(files));
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
              <PromptSelector />
              <FetchProviderSelector />
            </div>

            {/* 右侧工具：模型下拉 + 主操作按钮（发送 / 停止 / 禁用时晃动反馈） */}
            <div className='flex items-center gap-1'>
              <ModelSelector />
              <Button
                type='button'
                aria-label='发送'
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  if (status === 'stopping') {
                    toast.warning('正在停止当前回复，请稍候。');
                    return;
                  }

                  if (sendDisabled) {
                    const button = event.currentTarget;
                    if (typeof button.animate !== 'function') {
                      return;
                    }

                    button.animate(
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
                    handleSubmit();
                    return;
                  }

                  if (isBusy) {
                    event.preventDefault();
                    if (status === 'sending') {
                      void cancelSending('Composer/sendButton').catch((error) => {
                        console.error('Failed to cancel sending:', error);
                        toast.error(error instanceof Error ? error.message : '取消发送失败');
                      });
                      return;
                    }

                    void cancelAnswering('Composer/stopButton').catch((error) => {
                      console.error('Failed to stop answering:', error);
                      toast.error(error instanceof Error ? error.message : '停止失败');
                    });
                    return;
                  }

                  handleSubmit();
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
                {status === 'sending' || status === 'stopping' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : status === 'streaming' ? (
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
