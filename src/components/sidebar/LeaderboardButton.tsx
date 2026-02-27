import { Link, useMatch } from '@tanstack/react-router'
import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LeaderboardButton() {
  const isActive = !!useMatch({ from: '/app/leaderboard', shouldThrow: false })

  return (
    <Button
      asChild
      type='button'
      variant='ghost'
      size='default'
      className={cn(
        'group relative h-10 w-full justify-start overflow-hidden rounded-md border px-3 transition-all duration-300 ink-border bg-transparent text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)',
        isActive ? 'bg-(--surface-hover) text-(--text-primary)' : '',
      )}
      aria-label='Arena 榜单'
    >
      <Link to='/app/leaderboard'>
        <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
          <Trophy className='h-5 w-5 transition-transform duration-300 group-hover:rotate-6' />
        </span>
        <span className='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'>
          Arena 榜单
        </span>
      </Link>
    </Button>
  )
}
