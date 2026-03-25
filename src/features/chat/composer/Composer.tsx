import { ClipboardEvent, DragEvent, KeyboardEvent, useRef } from 'react';
import { useMountEffect } from '@/hooks/useMountEffect';
import { useNavigate } from '@tanstack/react-router';
import { useResponsive } from '@/components/ResponsiveContext';
import { AttachmentStack } from '@/features/chat/components/AttachmentStack';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/useToast';
import { submitMessage } from './submit-chat';
import {
  readComposerDraftFromStorage,
  setComposerInputWithLocalStorage,
  useComposerStore,
} from './useComposerStore';
import { ComposerToolbar } from './ComposerToolbar';

declare global {
  interface Window {
    __preHydrationInput?: string;
    __preHydrationInputHandler?: (e: Event) => void;
  }
}

export function Composer() {
  const navigate = useNavigate();
  const input = useComposerStore((state) => state.input);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const pendingQuotes = useComposerStore((state) => state.pendingQuotes);
  const uploading = useComposerStore((state) => state.uploading);
  const deviceType = useResponsive();
  const isDesktop = deviceType === 'desktop';
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const removeQuote = useComposerStore((state) => state.removeQuote);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useMountEffect(() => {
    const pre = window.__preHydrationInput;
    if (pre) {
      setComposerInputWithLocalStorage(pre);
    } else {
      const fromStorage = readComposerDraftFromStorage();
      if (fromStorage !== '') {
        setComposerInputWithLocalStorage(fromStorage);
      }
    }
    delete window.__preHydrationInput;
    if (window.__preHydrationInputHandler) {
      document.removeEventListener('input', window.__preHydrationInputHandler);
      delete window.__preHydrationInputHandler;
    }
  });

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

  const composerBoxClass =
    'relative z-10 flex w-full flex-col gap-2 rounded-xl bg-(--sidebar-surface) p-2 shadow-sm transition-shadow duration-200 focus-within:shadow-md';

  const textarea = (
    <Textarea
      ref={textareaRef}
      id='message-input'
      name='message'
      value={input}
      onChange={(event) => {
        setComposerInputWithLocalStorage(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      rows={1}
      placeholder='Type your message...'
      enterKeyHint={isDesktop ? undefined : 'enter'}
      className='min-h-9 max-h-50 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:text-base'
    />
  );

  const widthClass = 'w-[90%] max-w-full @[921px]:w-[50%] @[921px]:max-w-2xl';

  return (
    <div
      key='composer-wrapper'
      className='z-(--z-composer) w-full shrink-0 pb-3 md:pb-4'
    >
      <div
        key='composer-bottom'
        className={`relative mx-auto flex flex-col gap-2 ${widthClass}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <AttachmentStack
          items={pendingAttachments}
          quotes={pendingQuotes}
          onRemove={removeAttachment}
          onRemoveQuote={removeQuote}
        />
        <div className={composerBoxClass}>
          <div className='flex w-full items-end gap-2'>{textarea}</div>
          <ComposerToolbar />
        </div>
      </div>
    </div>
  );
}
