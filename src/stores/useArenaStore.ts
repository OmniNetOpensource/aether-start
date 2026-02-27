import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from '@/hooks/useToast'
import { buildAttachmentsFromFiles } from '@/lib/chat/attachments'
import {
  createArenaRoundFn,
  getLatestArenaSessionFn,
  voteArenaRoundFn,
} from '@/server/functions/arena'
import type {
  ArenaRoundView,
  ArenaSessionView,
  ArenaVoteChoice,
} from '@/types/arena'
import type { Attachment } from '@/types/message'

type ArenaState = {
  session: ArenaSessionView | null
  rounds: ArenaRoundView[]
  loading: boolean
  submitting: boolean
  votingRoundId: string | null
  input: string
  attachments: Attachment[]
  uploading: boolean
}

type ArenaActions = {
  loadLatestSession: () => Promise<void>
  submitRound: () => Promise<void>
  voteRound: (roundId: string, choice: ArenaVoteChoice) => Promise<void>
  setInput: (value: string) => void
  addAttachments: (files: File[]) => Promise<void>
  removeAttachment: (id: string) => void
  clearComposer: () => void
}

const mergeRound = (rounds: ArenaRoundView[], nextRound: ArenaRoundView) => {
  const index = rounds.findIndex((round) => round.id === nextRound.id)
  if (index < 0) {
    return [...rounds, nextRound]
  }

  const copied = [...rounds]
  copied[index] = nextRound
  return copied
}

export const useArenaStore = create<ArenaState & ArenaActions>()(
  devtools(
    (set, get) => ({
      session: null,
      rounds: [],
      loading: false,
      submitting: false,
      votingRoundId: null,
      input: '',
      attachments: [],
      uploading: false,

      loadLatestSession: async () => {
        if (get().loading) {
          return
        }

        set({ loading: true })
        try {
          const session = (await getLatestArenaSessionFn()) as ArenaSessionView | null
          set({
            session,
            rounds: session?.rounds ?? [],
            loading: false,
          })
        } catch (error) {
          set({ loading: false })
          const message = error instanceof Error ? error.message : '加载 Arena 会话失败'
          toast.error(message)
        }
      },

      submitRound: async () => {
        const { submitting, uploading, input, attachments, session } = get()
        if (submitting || uploading) {
          return
        }

        const hasPromptText = input.trim().length > 0
        const hasAttachments = attachments.length > 0
        if (!hasPromptText && !hasAttachments) {
          return
        }

        set({ submitting: true })

        try {
          const result = (await createArenaRoundFn({
            data: {
              sessionId: session?.id,
              promptText: input,
              attachments,
            },
          })) as { session: ArenaSessionView; round: ArenaRoundView }

          set({
            session: result.session,
            rounds: result.session.rounds,
            submitting: false,
            input: '',
            attachments: [],
          })
        } catch (error) {
          set({ submitting: false })
          const message = error instanceof Error ? error.message : '提交 Arena 对战失败'
          toast.error(message)
        }
      },

      voteRound: async (roundId, choice) => {
        if (!roundId || get().votingRoundId) {
          return
        }

        set({ votingRoundId: roundId })
        try {
          const result = (await voteArenaRoundFn({
            data: {
              roundId,
              choice,
            },
          })) as { round: ArenaRoundView }

          set((state) => {
            const mergedRounds = mergeRound(state.rounds, result.round)
            return {
              rounds: mergedRounds,
              session: state.session
                ? {
                    ...state.session,
                    rounds: mergedRounds,
                  }
                : state.session,
              votingRoundId: null,
            }
          })
        } catch (error) {
          set({ votingRoundId: null })
          const message = error instanceof Error ? error.message : '投票失败'
          toast.error(message)
        }
      },

      setInput: (value) => set({ input: value }),

      addAttachments: async (files) => {
        if (files.length === 0 || get().uploading) {
          return
        }

        set({ uploading: true })
        try {
          const built = await buildAttachmentsFromFiles(files)
          set((state) => ({
            attachments: [...state.attachments, ...built],
            uploading: false,
          }))
        } catch {
          set({ uploading: false })
          toast.error('上传附件失败')
        }
      },

      removeAttachment: (id) =>
        set((state) => ({
          attachments: state.attachments.filter((attachment) => attachment.id !== id),
        })),

      clearComposer: () =>
        set({
          input: '',
          attachments: [],
          uploading: false,
        }),
    }),
    { name: 'ArenaStore' },
  ),
)
