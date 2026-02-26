import { ClipboardEvent, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { ImagePreview } from '@/components/ImagePreview'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/useToast'
import { buildAttachmentsFromFiles } from '@/lib/chat/attachments'
import type { Attachment } from '@/types/message'
import type { NoteItem } from '@/stores/useNotesStore'

type NoteEditDialogProps = {
  open: boolean
  note: NoteItem | null
  onOpenChange: (open: boolean) => void
  onSave: (note: NoteItem) => Promise<void> | void
}

const collectClipboardFiles = (clipboardData: DataTransfer | null) => {
  if (!clipboardData) {
    return []
  }

  const pastedFiles: File[] = []
  if (clipboardData.files?.length) {
    pastedFiles.push(...Array.from(clipboardData.files))
    return pastedFiles
  }

  if (!clipboardData.items?.length) {
    return pastedFiles
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== 'file') {
      continue
    }
    const file = item.getAsFile()
    if (file) {
      pastedFiles.push(file)
    }
  }

  return pastedFiles
}

export function NoteEditDialog({
  open,
  note,
  onOpenChange,
  onSave,
}: NoteEditDialogProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || !note) {
      return
    }

    setContent(note.content ?? '')
    setAttachments(Array.isArray(note.attachments) ? note.attachments : [])
  }, [open, note])

  const handleAddAttachments = async (files: File[]) => {
    if (!files.length) {
      return
    }
    if (uploading) {
      toast.info('正在上传图片，请稍后再试。')
      return
    }

    setUploading(true)
    try {
      const nextAttachments = await buildAttachmentsFromFiles(files)
      if (nextAttachments.length === 0) {
        return
      }

      setAttachments((prev) => [...prev, ...nextAttachments])
    } finally {
      setUploading(false)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = collectClipboardFiles(event.clipboardData)
    if (!files.length) {
      return
    }

    event.preventDefault()
    void handleAddAttachments(files)
  }

  const handleSave = async () => {
    if (!note) {
      return
    }

    const hasContent = content.trim().length > 0
    const hasAttachments = attachments.length > 0
    if (!hasContent && !hasAttachments) {
      toast.warning('请输入文本或添加图片后再保存。')
      return
    }

    const now = new Date().toISOString()
    await onSave({
      ...note,
      content,
      attachments,
      updated_at: now,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto px-6 py-6 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>编辑灵感笔记</DialogTitle>
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
                    onClick={() => {
                      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
                    }}
                    className='absolute right-1 top-1 h-6 w-6 rounded-full bg-(--interactive-primary)/50 text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--interactive-primary)/70 hover:text-destructive'
                  >
                    <X className='h-3.5 w-3.5' />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onPaste={handlePaste}
            placeholder='记录你的灵感...'
            rows={8}
            className='min-h-40 resize-y'
          />

          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            multiple
            className='hidden'
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              void handleAddAttachments(files)
            }}
          />
        </div>

        <DialogFooter className='gap-2 sm:gap-2'>
          <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className='gap-1.5'
          >
            {uploading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <ImagePlus className='h-4 w-4' />
            )}
            添加图片
          </Button>
          <Button type='button' onClick={handleSave} disabled={uploading || !note}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
