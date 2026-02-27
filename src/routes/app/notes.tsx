import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Lightbulb, Loader2, Plus } from 'lucide-react'
import { NoteCard } from '@/components/notes/NoteCard'
import { NoteEditDialog } from '@/components/notes/NoteEditDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { buildAttachmentsFromFiles } from '@/lib/chat/attachments'
import { toast } from '@/hooks/useToast'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useComposerStore } from '@/stores/useComposerStore'
import { useEditingStore } from '@/stores/useEditingStore'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { useNotesStore, type NoteItem } from '@/stores/useNotesStore'

export const Route = createFileRoute('/app/notes')({
  component: NotesPage,
})

const generateNoteId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note_${Date.now()}_${Math.random().toString(16).slice(2)}`

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

function NotesPage() {
  const navigate = useNavigate()
  const notes = useNotesStore((state) => state.notes)
  const loading = useNotesStore((state) => state.loading)
  const loadingMore = useNotesStore((state) => state.loadingMore)
  const hasLoaded = useNotesStore((state) => state.hasLoaded)
  const hasMore = useNotesStore((state) => state.hasMore)
  const loadInitialNotes = useNotesStore((state) => state.loadInitialNotes)
  const loadMoreNotes = useNotesStore((state) => state.loadMoreNotes)
  const upsertNote = useNotesStore((state) => state.upsertNote)
  const deleteNote = useNotesStore((state) => state.deleteNote)

  const [editingNote, setEditingNote] = useState<NoteItem | null>(null)
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null)
  const [creatingByPaste, setCreatingByPaste] = useState(false)
  const scrollRootRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const isDialogOpen = editingNote !== null

  const emptyStateVisible = hasLoaded && notes.length === 0 && !loading

  useEffect(() => {
    void loadInitialNotes()
  }, [loadInitialNotes])

  useEffect(() => {
    if (!hasMore) {
      return
    }

    const sentinel = sentinelRef.current
    if (!sentinel) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }
        if (loadingMore || !hasMore) {
          return
        }
        void loadMoreNotes()
      },
      {
        root: scrollRootRef.current,
        rootMargin: '160px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMoreNotes])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isDialogOpen || creatingByPaste) {
        return
      }

      const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
      const files = collectClipboardFiles(event.clipboardData)

      if (!text && files.length === 0) {
        return
      }

      event.preventDefault()
      setCreatingByPaste(true)

      void (async () => {
        try {
          const attachments = files.length > 0 ? await buildAttachmentsFromFiles(files) : []
          if (!text && attachments.length === 0) {
            return
          }

          const now = new Date().toISOString()
          const note: NoteItem = {
            id: generateNoteId(),
            content: text,
            attachments,
            created_at: now,
            updated_at: now,
          }

          await upsertNote(note)
          toast.success('已创建灵感笔记')
        } finally {
          setCreatingByPaste(false)
        }
      })()
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [creatingByPaste, isDialogOpen, upsertNote])

  const selectedNote = useMemo(() => {
    if (!editingNote) {
      return null
    }

    const latest = notes.find((item) => item.id === editingNote.id)
    return latest ?? editingNote
  }, [editingNote, notes])

  const handleStartConversation = (note: NoteItem) => {
    useChatRequestStore.getState().clear()
    useEditingStore.getState().clear()
    useMessageTreeStore.getState().clear()

    const composer = useComposerStore.getState()
    composer.setInput(note.content ?? '')
    composer.setPendingAttachments(note.attachments ?? [])

    void navigate({ to: '/app' })
  }

  const handleCreateNote = useCallback(() => {
    const now = new Date().toISOString()
    setEditingNote({
      id: generateNoteId(),
      content: '',
      attachments: [],
      created_at: now,
      updated_at: now,
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isDialogOpen) {
        setEditingNote(null)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault()
        if (!isDialogOpen) {
          handleCreateNote()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDialogOpen, handleCreateNote])

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <header className='flex h-14 shrink-0 items-center justify-between border-b px-6'>
        <div className='flex items-center gap-2 text-(--text-primary)'>
          <Lightbulb className='h-5 w-5' />
          <h1 className='text-xl font-semibold md:text-2xl'>灵感笔记</h1>
        </div>
        <Button
          type='button'
          size='sm'
          className='gap-1.5'
          onClick={handleCreateNote}
        >
          <Plus className='h-4 w-4' />
          新建笔记
        </Button>
      </header>

      <div ref={scrollRootRef} className='min-h-0 flex-1 overflow-y-auto px-6 py-6'>
        {loading && !hasLoaded ? (
          <div className='flex items-center justify-center py-10 text-(--text-tertiary)'>
            <Loader2 className='h-4 w-4 animate-spin' />
            <span className='ml-2 text-sm'>加载笔记中...</span>
          </div>
        ) : (
          <div className='space-y-4'>
            {emptyStateVisible ? (
              <div className='flex flex-col items-center justify-center rounded-xl border border-dashed border-(--border-primary) bg-(--surface-muted)/30 px-8 py-12 text-center'>
                <Lightbulb className='mb-4 h-12 w-12 text-(--text-tertiary)' />
                <p className='text-base font-medium text-(--text-primary)'>
                  还没有灵感笔记
                </p>
                <p className='mt-2 text-sm text-(--text-secondary)'>
                  点击「新建笔记」开始记录，或使用 Ctrl+V 粘贴文本/图片快速创建
                </p>
                <Button
                  type='button'
                  size='sm'
                  className='mt-6 gap-1.5'
                  onClick={handleCreateNote}
                >
                  <Plus className='h-4 w-4' />
                  新建笔记
                </Button>
              </div>
            ) : null}

            <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={() => setEditingNote(note)}
                  onDelete={() => setNoteToDelete(note)}
                  onStartConversation={() => handleStartConversation(note)}
                />
              ))}
            </div>

            {hasMore || loadingMore ? (
              <div
                ref={sentinelRef}
                className='flex items-center justify-center py-4 text-(--text-tertiary)'
              >
                {loadingMore ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    <span className='ml-2 text-xs'>加载更多...</span>
                  </>
                ) : (
                  <span className='text-xs'>滚动加载更多...</span>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <NoteEditDialog
        open={isDialogOpen}
        note={selectedNote}
        isNew={
          selectedNote !== null &&
          !notes.some((n) => n.id === selectedNote.id)
        }
        onOpenChange={(open) => {
          if (!open) {
            setEditingNote(null)
          }
        }}
        onSave={async (note) => {
          await upsertNote(note)
        }}
      />

      <AlertDialog
        open={noteToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNoteToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除笔记</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条笔记吗？删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className='bg-(--status-destructive) text-(--status-destructive-foreground) hover:bg-(--status-destructive)/90'
              onClick={() => {
                if (noteToDelete) {
                  void deleteNote(noteToDelete.id)
                  setNoteToDelete(null)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
