import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import { useResponsive } from '@/shared/app-shell/ResponsiveContext';
import { AttachmentStack } from '@/features/attachments/attachment-preview';
import { Textarea } from '@/shared/design-system/textarea';
import { Button } from '@/shared/design-system/button';
import { toast } from '@/shared/app-shell/useToast';
import { cancelAnswering } from '@/features/chat/session';
import { submitMessage } from './submit-chat';
import { cn } from '@/shared/core/utils';
import { useChatRequestStore } from '@/features/chat/session';
import { ModelSelector } from './ModelSelector';
import { PromptSelector } from './PromptSelector';
import { useComposerStore } from './useComposerStore';

/**
 * 首屏：localStorage 草稿写入 window、DOMContentLoaded 注入 textarea、input 同步 window。
 * hydrate 前 Composer 用 useLayoutEffect 读入 store 并拆掉监听，避免闪白与丢字。
 */
declare global {
  interface Window {
    __preHydrationInput?: string;
    __preHydrationInputHandler?: (e: Event) => void;
  }
}

/** localStorage 草稿键：与首屏注入配合，刷新/重进可恢复未发送内容。 */
const COMPOSER_DRAFT_STORAGE_KEY = 'aether_composer_draft';

/**
 * 聊天输入区：附件与引用条、多行输入、提示词/模型选择与发送。
 *
 * 发送入口有两处：工具栏主按钮（见发送按钮 onClick），以及输入框 Ctrl+Enter（见 Textarea onKeyDown）。
 * 附件有三种入口：文件选择、粘贴图片/文件、拖放到外层容器。
 */
export function Composer() {
  const navigate = useNavigate();

  // --- 输入与附件（useComposerStore）---
  const input = useComposerStore((state) => state.input);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const pendingQuotes = useComposerStore((state) => state.pendingQuotes);
  const uploading = useComposerStore((state) =>
    state.pendingAttachments.some((item) => item.localUrl),
  );
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const removeQuote = useComposerStore((state) => state.removeQuote);
  const setInput = useComposerStore((state) => state.setInput);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // --- 请求状态（发送中/流式中决定主按钮图标与是否视为「忙」）---
  const status = useChatRequestStore((state) => state.status);
  // 隐藏 file input 与 label 关联，避免 id 冲突
  const fileInputId = useId();

  // paint 前：把首屏 window / DOM 里的内容写入 store（store 初始为 ''，hydration 会校正 DOM，故用 layout）
  useLayoutEffect(() => {
    const pre = window.__preHydrationInput;
    const currentDomValue = textareaRef.current?.value ?? '';
    const restoredInput = currentDomValue || pre || '';

    setInput(restoredInput);
    localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, restoredInput);

    delete window.__preHydrationInput;
    if (window.__preHydrationInputHandler) {
      document.removeEventListener('input', window.__preHydrationInputHandler);
      delete window.__preHydrationInputHandler;
    }
  }, [setInput]);

  // 输入变化即持久化草稿，便于意外刷新后恢复
  useEffect(() => {
    localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, input);
  }, [input]);

  // 在「其它区域」按下可打印字符时，把焦点抢回输入框（不抢已有输入框/快捷键）
  useMountEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      if ((event.target as HTMLElement)?.isContentEditable) {
        return;
      }

      event.preventDefault();
      textareaRef.current?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  /**
   * 主按钮是否「视觉上禁用」。
   * - 请求进行中（sending/streaming）：按钮可点，用于停止，不设为 disabled。
   * - 其余情况：无内容且无附件、无模型、或正在上传附件时禁用。
   * 草稿在首帧 paint 前由 useLayoutEffect 写入 store，sendDisabled 与受控 input 一致。
   */
  const isBusy = status !== 'idle';
  const hasComposerContent =
    input.trim().length !== 0 || pendingAttachments.length > 0 || pendingQuotes.length > 0;
  const sendDisabled = isBusy ? false : !hasComposerContent || uploading;

  const handleSubmit = () => {
    void submitMessage(async (conversationId) => {
      await navigate({
        to: '/app/c/$conversationId',
        params: { conversationId },
      });
    }).catch((error) => {
      console.error('Failed to submit message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    });
  };

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.log('[Composer]', { input, sendDisabled });
  }, [input, sendDisabled]);

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
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files ?? []);
          if (!files.length) return;
          if (uploading) {
            toast.info('Attachments are still uploading. Please wait.');
            return;
          }
          void addAttachments(files);
        }}
      >
        {/* 内容区容器：窄屏约 90% 宽、宽屏半宽且不超过 max-w-2xl；整块为拖放目标。首块为待发送附件缩略图 + 引用条，与下方输入区纵向 gap-2 分隔 */}
        <AttachmentStack
          items={pendingAttachments}
          quotes={pendingQuotes}
          onRemove={removeAttachment}
          onRemoveQuote={removeQuote}
        />
        {/* 输入卡片：圆角底衬 + 聚焦时加深阴影；z-10 保证在附件条之上叠放 */}
        <div className='liquid-glass relative z-10 flex w-full flex-col gap-2 rounded-xl border p-2 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 focus-within:shadow-md'>
          {/* 主输入行：多行文本框占满宽，底部与工具栏对齐 */}
          <div className='flex w-full items-end gap-2'>
            <Textarea
              ref={textareaRef}
              id='message-input'
              name='message'
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
                const clipboardData = event.clipboardData;
                if (!clipboardData) {
                  return;
                }

                const pastedFiles: File[] = [];

                if (clipboardData.files?.length) {
                  pastedFiles.push(...Array.from(clipboardData.files));
                } else if (clipboardData.items?.length) {
                  for (const item of Array.from(clipboardData.items)) {
                    if (item.kind !== 'file') {
                      continue;
                    }

                    const file = item.getAsFile();
                    if (file) {
                      pastedFiles.push(file);
                    }
                  }
                }

                if (pastedFiles.length === 0) {
                  return;
                }

                event.preventDefault();

                if (uploading) {
                  toast.info('Attachments are still uploading. Please wait.');
                  return;
                }

                void addAttachments(pastedFiles);
              }}
              rows={1}
              placeholder='Type your message...'
              enterKeyHint={useResponsive() === 'desktop' ? undefined : 'enter'}
              className='min-h-9 max-h-50 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:text-base'
            />
          </div>
          {/* 工具栏：左右分区 — 左为「附件 + 预设提示词」，右为「模型 + 发送」 */}
          <div className='flex items-center justify-between px-0.5'>
            {/* 左侧工具：隐藏 file input + 回形针触发、PromptSelector */}
            <div className='flex items-center gap-1'>
              <span
                title={
                  uploading ? '正在上传附件...' : '添加附件（支持 JPG、PNG、WebP、GIF，最大 20MB）'
                }
              >
                <input
                  id={fileInputId}
                  type='file'
                  multiple
                  onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                    if (uploading) {
                      return;
                    }

                    const files = event.target.files;
                    if (!files || files.length === 0) {
                      return;
                    }

                    await addAttachments(Array.from(files));
                    event.target.value = '';
                  }}
                  accept='image/jpeg,image/png,image/webp,image/gif'
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
                    aria-disabled={uploading}
                    title={uploading ? '正在上传附件...' : '添加附件'}
                    data-testid='composer-attachment-trigger'
                    className={cn(
                      'cursor-pointer',
                      uploading && 'pointer-events-none cursor-not-allowed',
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
            </div>

            {/* 右侧工具：模型下拉 + 主操作按钮（发送 / 停止 / 禁用时晃动反馈） */}
            <div className='flex items-center gap-1'>
              <ModelSelector />
              <Button
                type='button'
                aria-label='发送'
                aria-disabled={sendDisabled}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
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
                    return;
                  }

                  if (isBusy) {
                    event.preventDefault();
                    cancelAnswering('Composer/stopButton');
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
                {status === 'sending' ? (
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
