import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArenaComposer } from '@/components/arena/ArenaComposer'
import { ArenaRoundList } from '@/components/arena/ArenaRoundList'
import { useArenaStore } from '@/stores/useArenaStore'

export const Route = createFileRoute('/app/arena')({
  component: ArenaPage,
})

function ArenaPage() {
  const rounds = useArenaStore((state) => state.rounds)
  const loading = useArenaStore((state) => state.loading)
  const loadLatestSession = useArenaStore((state) => state.loadLatestSession)
  const voteRound = useArenaStore((state) => state.voteRound)
  const votingRoundId = useArenaStore((state) => state.votingRoundId)

  useEffect(() => {
    void loadLatestSession()
    document.title = 'Arena - Aether'
    return () => {
      document.title = 'Aether'
    }
  }, [loadLatestSession])

  return (
    <div className='flex h-full w-full flex-col'>
      <main className='relative flex min-h-0 flex-1'>
        <div className='relative flex min-w-0 flex-1 flex-col'>
          <div className='flex-1 min-h-0 overflow-y-auto'>
            {loading && rounds.length === 0 ? (
              <div className='flex h-full items-center justify-center text-sm text-(--text-tertiary)'>
                加载 Arena 会话中...
              </div>
            ) : (
              <ArenaRoundList
                rounds={rounds}
                votingRoundId={votingRoundId}
                onVote={(roundId, choice) => {
                  void voteRound(roundId, choice)
                }}
              />
            )}
          </div>

          <div className='absolute inset-x-0 bottom-0 z-(--z-composer) pb-4 md:pb-6'>
            <div
              className='pointer-events-none absolute inset-x-0 bottom-0 h-40'
              style={{
                background:
                  'linear-gradient(to top, var(--surface-primary) 0%, color-mix(in srgb, var(--surface-primary) 90%, transparent) 60%, transparent 100%)',
              }}
            />
            <ArenaComposer />
          </div>
        </div>
      </main>
    </div>
  )
}
