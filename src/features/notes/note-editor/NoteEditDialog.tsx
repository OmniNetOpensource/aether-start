import { ClipboardEvent, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { ImagePreview } from '@/features/attachments/attachment-preview';
import { Button } from '@/shared/design-system/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/design-system/dialog';
import { Textarea } from '@/shared/design-system/textarea';
import { toast } from '@/shared/app-shell/useToast';
import { collectClipboardFiles } from '@/shared/browser/file';
import { useAttachmentUpload } from '@/features/notes/attachment-intake';
import type { NoteItem } from '@/features/notes/note-record';

type NoteEditDialogProps = {
  open: boolean;
  note: NoteItem | null;
  isNew?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: NoteItem) => Promise<void> | void;
};

export function NoteEditDialog({
  open,
  note,
  isNew = false,
  onOpenChange,
  onSave,
}: NoteEditDialogProps) {
  const [content, setContent] = useState(() => note?.content ?? '');
  const initialAttachments = Array.isArray(note?.attachments) ? note.attachments : [];
  const { attachments, uploading, addFiles, removeAttachment } =
    useAttachmentUpload(initialAttachments);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = collectClipboardFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    if (uploading) {
      toast.info('正在上传图片，请稍后再试。');
      return;
    }
    void addFiles(files);
  };

  const handleSave = async () => {
    if (!note) {
      return;
    }

    const hasContent = content.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if (!hasContent && !hasAttachments) {
      toast.warning('请输入文本或添加图片后再保存。');
      return;
    }

    const now = new Date().toISOString();
    await onSave({
      ...note,
      content,
      attachments,
      updated_at: now,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto px-6 py-6 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{isNew ? '新建灵感笔记' : '编辑灵感笔记'}</DialogTitle>
          <DialogDescription>支持文本与图片，粘贴图片可直接上传。</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {attachments.length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {attachments.map((attachment) => (
                <div key={attachment.id} className='group relative'>
                  <ImagePreview
                    url={attachment.url}
                    name={attachment.name}
                    size={attachment.size}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    aria-label='移除附件'
                    onClick={() => removeAttachment(attachment.id)}
                    className='absolute right-1 top-1 h-6 w-6 rounded-full bg-[#404040] text-white transition-colors hover:bg-destructive'
                  >
                    <X className='h-3.5 w-3.5' />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-sm text-(--text-secondary)'>内容</span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className='h-8 gap-1.5 text-xs'
              >
                {uploading ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <ImagePlus className='h-4 w-4' />
                )}
                添加图片
              </Button>
            </div>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onPaste={handlePaste}
              placeholder='记录你的灵感...'
              rows={8}
              className='border-border placeholder:text-muted-foreground min-h-40 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-(--interactive-primary) focus-visible:ring-[3px] disabled:cursor-not-allowed md:text-sm'
            />
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            multiple
            className='hidden'
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addFiles(files);
            }}
          />
        </div>

        <DialogFooter className='flex-row justify-end gap-2'>
          <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type='button' onClick={handleSave} disabled={uploading || !note}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
