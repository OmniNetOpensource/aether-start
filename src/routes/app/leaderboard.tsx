import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getArenaLeaderboardFn } from '@/server/functions/arena'
import type { ArenaLeaderboardItem } from '@/types/arena'

export const Route = createFileRoute('/app/leaderboard')({
  component: LeaderboardPage,
})

function LeaderboardPage() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ArenaLeaderboardItem[]>([])

  useEffect(() => {
    document.title = 'Leaderboard - Aether'
    return () => {
      document.title = 'Aether'
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const result = await getArenaLeaderboardFn({ data: { limit: 50 } })
        setItems(result)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <header className='flex h-14 shrink-0 items-center justify-between border-b px-6'>
        <div className='flex items-center gap-2 text-(--text-primary)'>
          <Trophy className='h-5 w-5' />
          <h1 className='text-xl font-semibold md:text-2xl'>Arena Leaderboard</h1>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => {
            void (async () => {
              setLoading(true)
              try {
                const result = await getArenaLeaderboardFn({ data: { limit: 50 } })
                setItems(result)
              } finally {
                setLoading(false)
              }
            })()
          }}
          disabled={loading}
        >
          刷新
        </Button>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto px-6 py-6'>
        {loading && items.length === 0 ? (
          <div className='flex items-center justify-center py-10 text-(--text-tertiary)'>
            榜单加载中...
          </div>
        ) : (
          <div className='overflow-x-auto rounded-xl border border-border/50'>
            <table className='w-full min-w-[720px] text-sm'>
              <thead className='bg-(--surface-muted)/60 text-(--text-secondary)'>
                <tr>
                  <th className='px-4 py-3 text-left'>#</th>
                  <th className='px-4 py-3 text-left'>模型</th>
                  <th className='px-4 py-3 text-right'>ELO</th>
                  <th className='px-4 py-3 text-right'>对局</th>
                  <th className='px-4 py-3 text-right'>胜</th>
                  <th className='px-4 py-3 text-right'>负</th>
                  <th className='px-4 py-3 text-right'>平</th>
                  <th className='px-4 py-3 text-right'>胜率</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.roleId} className='border-t border-border/40'>
                    <td className='px-4 py-3 text-(--text-secondary)'>{item.rank}</td>
                    <td className='px-4 py-3 text-(--text-primary)'>{item.name}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.rating.toFixed(2)}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.matches}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.wins}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.losses}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.draws}</td>
                    <td className='px-4 py-3 text-right tabular-nums'>{item.winRate.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
