import { type ChangeEvent, type ClipboardEvent, type KeyboardEvent, useRef } from 'react'
import { ArrowUp, Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/useToast'
import { PeekingAttachments } from '@/components/chat/composer/PeekingAttachments'
import { useArenaStore } from '@/stores/useArenaStore'

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

export function ArenaComposer() {
  const input = useArenaStore((state) => state.input)
  const attachments = useArenaStore((state) => state.attachments)
  const uploading = useArenaStore((state) => state.uploading)
  const submitting = useArenaStore((state) => state.submitting)
  const setInput = useArenaStore((state) => state.setInput)
  const addAttachments = useArenaStore((state) => state.addAttachments)
  const removeAttachment = useArenaStore((state) => state.removeAttachment)
  const submitRound = useArenaStore((state) => state.submitRound)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const hasText = input.trim().length > 0
  const hasAttachments = attachments.length > 0
  const canSubmit = !uploading && !submitting && (hasText || hasAttachments)

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }

    await submitRound()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = collectClipboardFiles(event.clipboardData)
    if (files.length === 0) {
      return
    }

    event.preventDefault()

    if (uploading) {
      toast.info('正在上传附件，请稍后再试。')
      return
    }

    void addAttachments(files)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (uploading) {
      return
    }

    const files = event.target.files
    if (!files || files.length === 0) {
      return
    }

    void addAttachments(Array.from(files))
    event.target.value = ''
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
      className='relative flex flex-col w-[90%] md:w-[70%] lg:w-[50%] mx-auto gap-3'
    >
      {attachments.length > 0 ? (
        <div className='w-full flex justify-start'>
          <PeekingAttachments attachments={attachments} onRemove={removeAttachment} />
        </div>
      ) : null}

      <div className='relative z-10 flex w-full flex-col gap-1 rounded-xl border ink-border bg-background p-2 shadow-lg transition-all focus-within:border-(--interactive-secondary) focus-within:shadow-xl'>
        <div className='flex w-full items-end gap-2'>
          <Textarea
            id='arena-message-input'
            name='arena-message'
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder='在 Arena 中输入你的问题...'
            className='min-h-10 max-h-50 overflow-y-auto flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base'
          />
        </div>

        <div className='flex items-center justify-between px-1'>
          <div className='flex items-center gap-1'>
            <input
              type='file'
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              accept='image/*'
              className='hidden'
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || submitting}
              className='h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary)'
            >
              {uploading ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Paperclip className='h-3.5 w-3.5' />
              )}
            </Button>
          </div>

          <Button
            type='submit'
            size='icon'
            disabled={!canSubmit}
            className={cn(
              'h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200',
              !canSubmit
                ? 'bg-(--surface-muted) text-(--text-tertiary) hover:bg-(--surface-muted) scale-90 cursor-not-allowed'
                : 'bg-(--interactive-primary) text-(--surface-primary) hover:bg-(--interactive-primary) hover:scale-105 active:scale-95',
            )}
          >
            {submitting ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <ArrowUp className='h-5 w-5 rotate-90' />
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
