import { useRef } from 'react';
import { ArrowUp, ImagePlus, X } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { toast } from '@/shared/app-shell/useToast';
import { cn } from '@/shared/core/utils';
import { useChatRequestStore } from '@/features/chat/composer/composer-request/useChatRequestStore';
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
} from '@/features/chat/composer/composer-editor/composer-document';
import { useEditingStore } from '@/features/chat/message-thread';
import { useChatSessionStore } from '@/features/conversations/session';

type MessageEditorProps = {
  messageId: number;
  depth: number;
};

export function MessageEditor({ messageId, depth }: MessageEditorProps) {
  const editingState = useEditingStore((state) => state.editingState);
  const updateEditDocument = useEditingStore((state) => state.updateEditDocument);
  const cancelEditing = useEditingStore((state) => state.cancelEditing);
  const submitEdit = useEditingStore((state) => state.submitEdit);
  const status = useChatRequestStore((state) => state.status);
  const currentModelId = useChatSessionStore((state) => state.currentModelId);
  const editorRef = useRef<RichComposerEditorHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const state = editingState?.messageId === messageId ? editingState : null;

  if (!state) {
    return null;
  }

  const uploading = isComposerDocumentUploading(state.editedDocument);
  const sendDisabled =
    status !== 'idle' ||
    uploading ||
    isComposerDocumentEmpty(state.editedDocument) ||
    !currentModelId;

  const handleSubmit = () => {
    if (sendDisabled) {
      return;
    }

    void submitEdit(depth).catch((error) => {
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
        onClick={cancelEditing}
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
        document={state.editedDocument}
        onChange={updateEditDocument}
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
