import { useEffect, useRef, useState } from 'react'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import { cn } from '@/lib/utils'

const CONNECTED_VISIBLE_MS = 2000
const FADE_OUT_MS = 220

type VisibleConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'

export function ConnectionStatusInline() {
  const connectionState = useChatRequestStore((s) => s.connectionState)
  const [visibleState, setVisibleState] = useState<VisibleConnectionState>('idle')
  const [fadingOut, setFadingOut] = useState(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    syncTimerRef.current = setTimeout(() => {
      setFadingOut(false)
      setVisibleState(connectionState === 'idle' ? 'idle' : connectionState)
      syncTimerRef.current = null
    }, 0)

    if (connectionState === 'connected') {
      fadeTimerRef.current = setTimeout(() => {
        setFadingOut(true)
      }, CONNECTED_VISIBLE_MS)

      hideTimerRef.current = setTimeout(() => {
        setVisibleState('idle')
        setFadingOut(false)
      }, CONNECTED_VISIBLE_MS + FADE_OUT_MS)
    }

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [connectionState])

  if (visibleState === 'idle') {
    return null
  }

  const isConnecting = visibleState === 'connecting'
  const isConnected = visibleState === 'connected'

  const text = isConnecting
    ? '正在建立实时连接...'
    : isConnected
      ? '实时连接已建立'
      : '实时连接已断开'

  const toneClass =
    isConnecting || isConnected
      ? 'border-(--status-info) bg-(--status-info)/10 text-(--status-info)'
      : 'border-(--status-destructive) bg-(--status-destructive)/10 text-(--status-destructive)'

  return (
    <div className='mt-3 flex w-full items-center'>
      <div
        role='status'
        aria-live='polite'
        className={cn(
          'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-opacity duration-200',
          toneClass,
          fadingOut ? 'opacity-0' : 'opacity-100',
        )}
      >
        {isConnecting ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin' />
        ) : isConnected ? (
          <Wifi className='h-3.5 w-3.5' />
        ) : (
          <WifiOff className='h-3.5 w-3.5' />
        )}
        <span>{text}</span>
      </div>
    </div>
  )
}
