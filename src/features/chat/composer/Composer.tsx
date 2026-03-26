import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useId,
  useRef,
} from 'react';
import { useMountEffect } from '@/hooks/useMountEffect';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import { useResponsive } from '@/components/ResponsiveContext';
import { AttachmentStack } from '@/features/chat/components/AttachmentStack';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { cancelAnswering } from '@/features/chat/request/chat-orchestrator';
import { submitMessage } from './submit-chat';
import { cn } from '@/lib/utils';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { ModelSelector } from './ModelSelector';
import { PromptSelector } from './PromptSelector';
import { useComposerStore } from './useComposerStore';

/**
 * 首屏 hydration 前，根节点脚本可能把用户在输入框里已打的字放到 window 上，
 * 避免 React 接管时闪白或丢字。hydrate 后由 Composer 读入 store 并清掉。
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
 * 发送入口有两处：工具栏主按钮（见 handleSendClick），以及输入框 Ctrl+Enter（见 handleKeyDown）。
 * 附件有三种入口：文件选择、粘贴图片/文件、拖放到外层容器。
 */
export function Composer() {
  const navigate = useNavigate();

  // --- 输入与附件（useComposerStore）---
  const input = useComposerStore((state) => state.input);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const pendingQuotes = useComposerStore((state) => state.pendingQuotes);
  const uploading = useComposerStore((state) => state.uploading);
  const deviceType = useResponsive();
  const isDesktop = deviceType === 'desktop';
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const removeQuote = useComposerStore((state) => state.removeQuote);
  const setInput = useComposerStore((state) => state.setInput);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // --- 请求状态（发送中/流式中决定主按钮图标与是否视为「忙」）---
  const status = useChatRequestStore((state) => state.status);
  // --- 当前会话选中的模型：未选模型时不允许发送 ---
  const currentModelId = useChatSessionStore((state) => state.currentModelId);
  // 隐藏 file input 与 label 关联，避免 id 冲突
  const fileInputId = useId();

  // 挂载一次：把首屏 window 里的草稿写入 store + localStorage，并拆掉 document 上的临时 input 监听
  useMountEffect(() => {
    const pre = window.__preHydrationInput;
    if (pre) {
      setInput(pre);
      localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, pre);
    }
    delete window.__preHydrationInput;
    if (window.__preHydrationInputHandler) {
      document.removeEventListener('input', window.__preHydrationInputHandler);
      delete window.__preHydrationInputHandler;
    }
  });

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

      textareaRef.current?.focus();
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  });

  /**
   * 主按钮是否「视觉上禁用」。
   * - 请求进行中（sending/streaming）：按钮可点，用于停止，不设为 disabled。
   * - 仍存在 __preHydrationInput 时：首帧可能尚未同步完，避免误锁死按钮。
   * - 其余情况：无内容且无附件、无模型、或正在上传附件时禁用。
   */
  const isBusy = status !== 'idle';
  const hasText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const sendDisabled =
    isBusy || !!window.__preHydrationInput
      ? false
      : (!hasText && !hasAttachments) || !currentModelId || uploading;

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)';

  // Ctrl+Enter：与主按钮相同的发送路径（submitMessage + 必要时导航到新会话）
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      void submitMessage((conversationId) =>
        navigate({
          to: '/app/c/$conversationId',
          params: { conversationId },
        }),
      );
    }
  };

  // 从剪贴板收文件：优先 files，否则遍历 items 里 kind === 'file'
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
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
  };

  // 允许 drop：必须 preventDefault，否则浏览器默认不触发 drop
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;
    if (uploading) {
      toast.info('Attachments are still uploading. Please wait.');
      return;
    }
    void addAttachments(files);
  };

  // 工具栏「回形针」选文件：清空 value 以便同一文件可重复选
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (uploading) {
      return;
    }

    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    await addAttachments(Array.from(files));
    event.target.value = '';
  };

  // 在不允许发送时点击主按钮：横向晃动提示，不触发发送
  const triggerBlockedSendAnimation = (button: HTMLButtonElement) => {
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
  };

  /**
   * 主按钮：禁用时晃动；流式/发送中时点按 = 取消回答；否则走 submitMessage。
   * sendDisabled 在「忙」时为 false，因此这里用 isBusy 区分停止与发送。
   */
  const handleSendClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (sendDisabled) {
      triggerBlockedSendAnimation(event.currentTarget);
      return;
    }

    if (isBusy) {
      event.preventDefault();
      cancelAnswering();
      return;
    }

    void submitMessage((conversationId) =>
      navigate({
        to: '/app/c/$conversationId',
        params: { conversationId },
      }),
    );
  };

  const composerBoxClass =
    'relative z-10 flex w-full flex-col gap-2 rounded-xl bg-(--sidebar-surface) p-2 shadow-sm transition-shadow duration-200 focus-within:shadow-md';

  // defaultValue 配合首屏 __preHydrationInput，减轻受控初次渲染与 store 同步之间的闪烁
  const textarea = (
    <Textarea
      ref={textareaRef}
      id='message-input'
      name='message'
      value={input}
      defaultValue={window.__preHydrationInput ?? ''}
      onChange={(event) => setInput(event.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      rows={1}
      placeholder='Type your message...'
      enterKeyHint={isDesktop ? undefined : 'enter'}
      className='min-h-9 max-h-50 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:text-base'
    />
  );

  // 容器宽度：窄屏占 90%，宽屏约半宽且不超过 max-w-2xl（与 tailwind 容器查询一致）
  const widthClass = 'w-[90%] max-w-full @[921px]:w-[50%] @[921px]:max-w-2xl';

  return (
    <div key='composer-wrapper' className='z-(--z-composer) w-full shrink-0 pb-3 md:pb-4'>
      <div
        key='composer-bottom'
        className={`relative mx-auto flex flex-col gap-2 ${widthClass}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 已选附件与引用块，在输入框上方 */}
        <AttachmentStack
          items={pendingAttachments}
          quotes={pendingQuotes}
          onRemove={removeAttachment}
          onRemoveQuote={removeQuote}
        />
        <div className={composerBoxClass}>
          <div className='flex w-full items-end gap-2'>{textarea}</div>
          {/* 左：附件 + 提示词；右：模型 + 发送 */}
          <div className='flex items-center justify-between px-0.5'>
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
                  onChange={handleFileChange}
                  accept='image/jpeg,image/png,image/webp,image/gif'
                  className='sr-only'
                  data-testid='composer-file-input'
                />
                <Button
                  asChild
                  variant='ghost'
                  size='sm'
                  className={cn(
                    toolButtonBaseClass,
                    'disabled:cursor-not-allowed disabled:text-(--text-primary)',
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

            <div className='flex items-center gap-1'>
              <ModelSelector />
              {/* 图标：发送中 spinner → 流式中停止方块 → 空闲箭头（可旋转强调可发） */}
              <Button
                type='button'
                aria-disabled={sendDisabled}
                onClick={handleSendClick}
                size='icon'
                data-testid='composer-send-button'
                className={cn(
                  'h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200',
                  sendDisabled
                    ? 'bg-(--surface-muted) text-(--text-tertiary) hover:bg-(--surface-muted) scale-90 cursor-not-allowed'
                    : 'bg-(--interactive-primary) text-(--surface-primary) hover:bg-(--interactive-primary) hover:scale-105 active:scale-95',
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
