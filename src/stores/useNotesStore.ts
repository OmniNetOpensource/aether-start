import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Attachment } from '@/types/message'
import {
  deleteNoteFn,
  listNotesPageFn,
  upsertNoteFn,
  type NotesCursor,
} from '@/server/functions/notes'

export type NoteItem = {
  id: string
  user_id?: string
  content: string
  attachments: Attachment[]
  created_at: string
  updated_at: string
}

type NotesState = {
  notes: NoteItem[]
  loading: boolean
  loadingMore: boolean
  hasLoaded: boolean
  hasMore: boolean
  cursor: NotesCursor
}

type NotesActions = {
  loadInitialNotes: () => Promise<void>
  loadMoreNotes: () => Promise<void>
  upsertNote: (note: NoteItem) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  reset: () => void
}

const PAGE_SIZE = 20

const sortByUpdatedAt = (notes: NoteItem[]) => {
  const sorted = [...notes]
  sorted.sort((a, b) => {
    const byUpdated = b.updated_at.localeCompare(a.updated_at)
    if (byUpdated !== 0) {
      return byUpdated
    }

    return b.id.localeCompare(a.id)
  })
  return sorted
}

const mergeNotes = (notes: NoteItem[], incoming: NoteItem[]) => {
  const map = new Map<string, NoteItem>()

  for (const note of notes) {
    map.set(note.id, note)
  }

  for (const note of incoming) {
    map.set(note.id, note)
  }

  return sortByUpdatedAt(Array.from(map.values()))
}

const normalizeNote = (note: NoteItem): NoteItem => ({
  id: note.id,
  user_id: note.user_id,
  content: note.content ?? '',
  attachments: Array.isArray(note.attachments) ? note.attachments : [],
  created_at: note.created_at,
  updated_at: note.updated_at,
})

export const useNotesStore = create<NotesState & NotesActions>()(
  devtools(
    (set, get) => ({
      notes: [],
      loading: false,
      loadingMore: false,
      hasLoaded: false,
      hasMore: false,
      cursor: null,

      loadInitialNotes: async () => {
        const { hasLoaded, loading } = get()
        if (hasLoaded || loading) {
          return
        }

        set((state) => ({ ...state, loading: true }))

        try {
          const page = await listNotesPageFn({
            data: { limit: PAGE_SIZE, cursor: null },
          })
          const mapped = (page.items as NoteItem[]).map(normalizeNote)

          set((state) => ({
            ...state,
            notes: mergeNotes(state.notes, mapped),
            loading: false,
            loadingMore: false,
            hasLoaded: true,
            hasMore: page.nextCursor !== null,
            cursor: page.nextCursor,
          }))
        } catch (error) {
          console.error('Failed to load notes:', error)
          set((state) => ({
            ...state,
            loading: false,
            loadingMore: false,
            hasLoaded: true,
            hasMore: false,
            cursor: null,
          }))
        }
      },

      loadMoreNotes: async () => {
        const { hasLoaded, loading, loadingMore, hasMore, cursor } = get()
        if (!hasLoaded || loading || loadingMore || !hasMore) {
          return
        }

        set((state) => ({ ...state, loadingMore: true }))

        try {
          const page = await listNotesPageFn({
            data: { limit: PAGE_SIZE, cursor },
          })
          const mapped = (page.items as NoteItem[]).map(normalizeNote)

          set((state) => ({
            ...state,
            notes: mergeNotes(state.notes, mapped),
            loadingMore: false,
            hasMore: page.nextCursor !== null,
            cursor: page.nextCursor,
          }))
        } catch (error) {
          console.error('Failed to load more notes:', error)
          set((state) => ({
            ...state,
            loadingMore: false,
            hasMore: false,
            cursor: null,
          }))
        }
      },

      upsertNote: async (note) => {
        const normalized = normalizeNote(note)

        set((state) => ({
          ...state,
          notes: mergeNotes(state.notes, [normalized]),
        }))

        try {
          await upsertNoteFn({
            data: {
              id: normalized.id,
              content: normalized.content,
              attachments: normalized.attachments,
              created_at: normalized.created_at,
              updated_at: normalized.updated_at,
            },
          })
        } catch (error) {
          console.error('Failed to upsert note:', error)
        }
      },

      deleteNote: async (id) => {
        set((state) => ({
          ...state,
          notes: state.notes.filter((item) => item.id !== id),
        }))

        try {
          await deleteNoteFn({ data: { id } })
        } catch (error) {
          console.error('Failed to delete note:', error)
        }
      },

      reset: () => {
        set((state) => ({
          ...state,
          notes: [],
          loading: false,
          loadingMore: false,
          hasLoaded: false,
          hasMore: false,
          cursor: null,
        }))
      },
    }),
    { name: 'NotesStore' },
  ),
)
