import { useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Lightbulb, Loader2, Plus } from 'lucide-react';
import { buildAttachmentsFromFiles } from '@/shared/attachments';
import { collectClipboardFiles } from '@/lib/utils/file';
import { NoteCard } from '@/features/notes/components/NoteCard';
import { NoteEditDialog } from '@/features/notes/components/NoteEditDialog';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useComposerStore } from '@/features/chat/composer/useComposerStore';
import { useEditingStore } from '@/features/chat/editing/useEditingStore';
import { useNotesStore, type NoteItem } from '@/features/notes/useNotesStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';

export const Route = createFileRoute('/app/notes')({
  component: NotesPage,
});

const generateNoteId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const createEmptyNote = (): NoteItem => {
  const now = new Date().toISOString();
  return {
    id: generateNoteId(),
    content: '',
    attachments: [],
    created_at: now,
    updated_at: now,
  };
};

function NotesPage() {
  const navigate = useNavigate();
  const notes = useNotesStore((state) => state.notes);
  const loading = useNotesStore((state) => state.loading);
  const loadingMore = useNotesStore((state) => state.loadingMore);
  const hasLoaded = useNotesStore((state) => state.hasLoaded);
  const hasMore = useNotesStore((state) => state.hasMore);
  const loadInitialNotes = useNotesStore((state) => state.loadInitialNotes);
  const loadMoreNotes = useNotesStore((state) => state.loadMoreNotes);
  const upsertNote = useNotesStore((state) => state.upsertNote);
  const deleteNote = useNotesStore((state) => state.deleteNote);

  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null);
  const [creatingByPaste, setCreatingByPaste] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const isDialogOpen = editingNote !== null;
  const emptyStateVisible = hasLoaded && notes.length === 0 && !loading;

  useEffect(() => {
    void loadInitialNotes();
  }, [loadInitialNotes]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        if (loadingMore || !hasMore) {
          return;
        }

        void loadMoreNotes();
      },
      {
        root: scrollRootRef.current,
        rootMargin: '160px',
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreNotes]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isDialogOpen || creatingByPaste) {
        return;
      }

      const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      const files = collectClipboardFiles(event.clipboardData);
      if (!text && files.length === 0) {
        return;
      }

      event.preventDefault();
      setCreatingByPaste(true);

      void (async () => {
        try {
          const attachments = files.length > 0 ? await buildAttachmentsFromFiles(files) : [];
          if (!text && attachments.length === 0) {
            return;
          }

          const now = new Date().toISOString();
          await upsertNote({
            id: generateNoteId(),
            content: text,
            attachments,
            created_at: now,
            updated_at: now,
          });

          toast.success('Note created from clipboard');
        } finally {
          setCreatingByPaste(false);
        }
      })();
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [creatingByPaste, isDialogOpen, upsertNote]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isDialogOpen) {
        setEditingNote(null);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault();
        if (!isDialogOpen) {
          setEditingNote(createEmptyNote());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen]);

  const selectedNote = editingNote
    ? (notes.find((item) => item.id === editingNote.id) ?? editingNote)
    : null;

  const handleStartConversation = (note: NoteItem) => {
    useChatRequestStore.getState().setStatus('idle', 'notes/startConversation');
    useEditingStore.getState().clear();
    useChatSessionStore.getState().clearSession();

    const composer = useComposerStore.getState();
    composer.setInput(note.content ?? '');
    composer.setPendingAttachments(note.attachments ?? []);

    void navigate({ to: '/app' });
  };

  const handleCreateNote = () => {
    setEditingNote(createEmptyNote());
  };

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <header className='flex h-14 shrink-0 items-center justify-between border-b px-6'>
        <div className='flex items-center gap-2 text-(--text-primary)'>
          <Lightbulb className='h-5 w-5' />
          <h1 className='text-xl font-semibold md:text-2xl'>Notes</h1>
        </div>
        <Button type='button' size='sm' className='gap-1.5' onClick={handleCreateNote}>
          <Plus className='h-4 w-4' />
          New note
        </Button>
      </header>

      <div ref={scrollRootRef} className='min-h-0 flex-1 overflow-y-auto px-6 py-6'>
        {loading && !hasLoaded ? (
          <div className='flex items-center justify-center py-10 text-(--text-tertiary)'>
            <Loader2 className='h-4 w-4 animate-spin' />
            <span className='ml-2 text-sm'>Loading notes...</span>
          </div>
        ) : (
          <div className='space-y-4'>
            {emptyStateVisible ? (
              <div className='flex flex-col items-center justify-center rounded-xl border border-dashed border-(--border-primary) bg-(--surface-muted) px-8 py-12 text-center'>
                <Lightbulb className='mb-4 h-12 w-12 text-(--text-tertiary)' />
                <p className='text-base font-medium text-(--text-primary)'>No notes yet.</p>
                <p className='mt-2 text-sm text-(--text-secondary)'>
                  Create a note or paste text and images with Ctrl+V to turn your clipboard into a
                  note instantly.
                </p>
                <Button type='button' size='sm' className='mt-6 gap-1.5' onClick={handleCreateNote}>
                  <Plus className='h-4 w-4' />
                  New note
                </Button>
              </div>
            ) : null}

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
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
                    <span className='ml-2 text-xs'>Loading more...</span>
                  </>
                ) : (
                  <span className='text-xs'>Scroll to load more...</span>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <NoteEditDialog
        key={selectedNote?.id ?? 'new'}
        open={isDialogOpen}
        note={selectedNote}
        isNew={selectedNote !== null && !notes.some((item) => item.id === selectedNote.id)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingNote(null);
          }
        }}
        onSave={async (note) => {
          await upsertNote(note);
        }}
      />

      <AlertDialog
        open={noteToDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setNoteToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected note will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-(--status-destructive) text-(--status-destructive-foreground) hover:bg-(--status-destructive)/90'
              onClick={() => {
                if (noteToDelete) {
                  void deleteNote(noteToDelete.id);
                  setNoteToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
