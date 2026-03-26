import { ChangeEvent, MouseEvent, useId } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cancelAnswering } from '@/features/chat/request/chat-orchestrator';
import { submitMessage } from './submit-chat';
import { cn } from '@/lib/utils';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { useComposerStore } from './useComposerStore';
import { ModelSelector } from './ModelSelector';
import { PromptSelector } from './PromptSelector';

export function ComposerToolbar() {
  const navigate = useNavigate();
  const status = useChatRequestStore((state) => state.status);
  const input = useComposerStore((state) => state.input);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const uploading = useComposerStore((state) => state.uploading);
  const currentModelId = useChatSessionStore((state) => state.currentModelId);
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const fileInputId = useId();

  const isBusy = status !== 'idle';
  const hasText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const sendDisabled =
    isBusy || window.__preHydrationInput
      ? false
      : (!hasText && !hasAttachments) || !currentModelId || uploading;

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)';

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

  return (
    <div className='flex items-center justify-between px-0.5'>
      <div className='flex items-center gap-1'>
        <span
          title={uploading ? '正在上传附件...' : '添加附件（支持 JPG、PNG、WebP、GIF，最大 20MB）'}
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
  );
}
