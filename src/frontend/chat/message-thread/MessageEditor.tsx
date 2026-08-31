import { useRef } from 'react';
import { ArrowUp, ImagePlus, X } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { useToast } from '@/frontend/app-shell/useToast';
import { cn } from '@/shared/core/utils';
import { useCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import {
  registerActiveInput,
  setLastFocusedInput,
} from '@/frontend/chat/composer/composer-editor/active-input';
import {
  RichComposerEditor,
  type RichComposerEditorHandle,
} from '@/frontend/chat/composer/composer-editor/RichComposerEditor';
import {
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from '@/frontend/chat/composer/composer-editor/composer-document';

type MessageEditorProps = {
  messageId: number;
  document: ComposerDocument;
  onDocumentChange: (document: ComposerDocument) => void;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
};

export function MessageEditor(props: MessageEditorProps) {
  const toast = useToast();
  const editor = useRef<RichComposerEditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentModelId = useCurrentModelId();

  const uploading = isComposerDocumentUploading(props.document);
  const sendDisabled = uploading || isComposerDocumentEmpty(props.document) || !currentModelId;

  const handleSubmit = () => {
    if (sendDisabled) {
      return;
    }

    void props.onSubmit().catch((error) => {
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
        onClick={props.onCancel}
        className='absolute right-2 top-2 z-10 h-7 w-7 text-secondary transition-colors hover:text-foreground'
      >
        <X className='h-4 w-4' />
      </Button>

      <RichComposerEditor
        ref={(currentEditor) => {
          editor.current = currentEditor;
          registerActiveInput({ type: 'edit', messageId: props.messageId }, currentEditor);
        }}
        id={`message-editor-${props.messageId}`}
        document={props.document}
        onChange={props.onDocumentChange}
        onFocus={() => setLastFocusedInput({ type: 'edit', messageId: props.messageId })}
        onSubmit={handleSubmit}
        autoFocus
        ariaLabel='Edit message'
        className='min-h-10 max-h-[200px] pr-8'
      />

      <div className='flex items-center justify-between gap-2 pt-1'>
        <input
          ref={fileInput}
          type='file'
          multiple
          accept='image/*'
          className='hidden'
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void editor.current?.insertFiles(files);
          }}
        />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-8 gap-1.5 px-2 text-xs'
          onClick={() => fileInput.current?.click()}
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
