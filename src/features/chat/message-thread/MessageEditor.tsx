import { useRef } from 'react';
import { ArrowUp, ImagePlus, X } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { useToast } from '@/shared/app-shell/useToast';
import { cn } from '@/shared/core/utils';
import type { ChatStatus } from '@/features/chat/agent-runtime/chat-runtime-state';
import {
  registerActiveInput,
  setLastFocusedInput,
} from '@/features/chat/composer/composer-editor/active-input';
import {
  RichComposerEditor,
  type RichComposerEditorHandle,
} from '@/features/chat/composer/composer-editor/RichComposerEditor';
import {
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from '@/features/chat/composer/composer-editor/composer-document';

type MessageEditorProps = {
  messageId: number;
  document: ComposerDocument;
  status: ChatStatus;
  currentModelId: string;
  onDocumentChange: (document: ComposerDocument) => void;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
};

export function MessageEditor({
  messageId,
  document,
  status,
  currentModelId,
  onDocumentChange,
  onCancel,
  onSubmit,
}: MessageEditorProps) {
  const toast = useToast();
  const editorRef = useRef<RichComposerEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploading = isComposerDocumentUploading(document);
  const sendDisabled =
    status !== 'idle' || uploading || isComposerDocumentEmpty(document) || !currentModelId;

  const handleSubmit = () => {
    if (sendDisabled) {
      return;
    }

    void onSubmit().catch((error) => {
      console.error('Failed to submit edit:', error);
      toast.error(error instanceof Error ? error.message : '编辑失败');
    });
  };

  return (
    <div className='relative flex w-full flex-col gap-2 rounded-xl border bg-muted p-3 shadow-sm'>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Cancel editing'
        onClick={onCancel}
        className='absolute right-2 top-2 z-10 h-7 w-7 text-secondary transition-colors hover:text-foreground'
      >
        <X className='h-4 w-4' />
      </Button>

      <RichComposerEditor
        ref={(editor) => {
          editorRef.current = editor;
          registerActiveInput({ type: 'edit', messageId }, editor);
        }}
        id={`message-editor-${messageId}`}
        document={document}
        onChange={onDocumentChange}
        onFocus={() => setLastFocusedInput({ type: 'edit', messageId })}
        onSubmit={handleSubmit}
        autoFocus
        placeholder='Edit your message...'
        className='min-h-10 max-h-[200px] pr-8'
      />

      <div className='flex items-center justify-between gap-2 pt-1'>
        <input
          ref={fileInputRef}
          type='file'
          multiple
          accept='image/*'
          className='hidden'
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void editorRef.current?.insertFiles(files);
          }}
        />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-8 gap-1.5 px-2 text-xs'
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus className='h-3.5 w-3.5' />
          Add image
        </Button>
        <Button
          type='button'
          onClick={handleSubmit}
          disabled={sendDisabled}
          size='icon'
          aria-label='Submit edit'
          className={cn(
            'h-8 w-8 rounded-full transition-all duration-200',
            sendDisabled
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'hover:scale-105 active:scale-95',
          )}
        >
          <ArrowUp className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
