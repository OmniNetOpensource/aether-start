import { useState, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Quote, Volume2, Loader2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ttsSynthesizeFn } from '@/server/functions/tts'
import { toast } from '@/hooks/useToast'
import { insertQuoteAtCursor } from '@/lib/chat/composer-focus'

type TtsState = 'idle' | 'loading' | 'playing'

type SelectionToolbarProps = {
  containerRef: RefObject<HTMLElement | null>
}

const getSelectionContainer = (range: Range) => {
  const node = range.commonAncestorContainer
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

const getSelectionRect = (range: Range) => {
  const rect = range.getBoundingClientRect()
  if (rect && (rect.width || rect.height)) return rect
  const rects = range.getClientRects()
  return rects.length > 0 ? rects[0] : null
}

export function SelectionToolbar({ containerRef }: SelectionToolbarProps) {
  const [text, setText] = useState('')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const hasSelection = Boolean(text && rect)

  const clearSelection = () => {
    if (typeof window !== 'undefined') {
      const current = window.getSelection()
      if (current) current.removeAllRanges()
    }
    setText('')
    setRect(null)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  // Listen for mouseup/touchend on the container to detect selections
  useEffect(() => {
    const updateSelection = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (typeof window === 'undefined') return

      timeoutRef.current = setTimeout(() => {
        const current = window.getSelection()
        if (!current || current.isCollapsed || current.rangeCount === 0) {
          setText('')
          setRect(null)
          return
        }

        const selectedText = current.toString().trim()
        if (!selectedText) {
          setText('')
          setRect(null)
          return
        }

        const range = current.getRangeAt(0)
        const container = getSelectionContainer(range)
        const root = containerRef.current

        if (!root || !container || !root.contains(container)) {
          setText('')
          setRect(null)
          return
        }

        const messageElement = container.closest("[data-role='assistant']")
        if (!messageElement) {
          setText('')
          setRect(null)
          return
        }

        const selRect = getSelectionRect(range)
        if (!selRect) {
          setText('')
          setRect(null)
          return
        }

        setText(selectedText)
        setRect(selRect)
      }, 250)
    }

    const el = containerRef.current
    if (!el) return
    el.addEventListener('mouseup', updateSelection)
    el.addEventListener('touchend', updateSelection)
    return () => {
      el.removeEventListener('mouseup', updateSelection)
      el.removeEventListener('touchend', updateSelection)
    }
  }, [containerRef])

  // Clear selection when clicking outside toolbar
  useEffect(() => {
    if (!text) return

    const clearSelectionFromEffect = () => {
      if (typeof window !== 'undefined') {
        const current = window.getSelection()
        if (current) current.removeAllRanges()
      }
      setText('')
      setRect(null)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-selection-toolbar]')) return
      const root = containerRef.current
      if (!root) { clearSelectionFromEffect(); return }
      if (event.target instanceof Node && root.contains(event.target)) return
      clearSelectionFromEffect()
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [text, containerRef])

  // Clear when browser selection collapses
  useEffect(() => {
    const handleSelectionChange = () => {
      if (typeof window === 'undefined') return
      const current = window.getSelection()
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setText('')
        setRect(null)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleQuote = () => {
    if (text) {
      insertQuoteAtCursor(text)
      clearSelection()
    }
  }

  const floatingRef = useRef<HTMLDivElement | null>(null)
  const hiddenStyles: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  }
  const [positionedStyles, setPositionedStyles] = useState<React.CSSProperties>(hiddenStyles)

  useEffect(() => {
    if (!rect || !hasSelection) return

    // Wait a frame so the floating element is rendered and measurable
    const raf = requestAnimationFrame(() => {
      const el = floatingRef.current
      if (!el) return

      const pad = 8
      const elRect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Prefer placing above; flip below if not enough space
      let top: number
      if (rect.top - elRect.height - pad >= 0) {
        top = rect.top - elRect.height
      } else if (rect.bottom + elRect.height + pad <= vh) {
        top = rect.bottom
      } else {
        top = rect.top - elRect.height
      }

      // Center horizontally on selection, then shift to stay in viewport
      let left = rect.left + rect.width / 2 - elRect.width / 2
      if (left < pad) left = pad
      if (left + elRect.width > vw - pad) left = vw - pad - elRect.width

      setPositionedStyles({
        position: 'fixed',
        top,
        left,
        zIndex: 100,
        visibility: 'visible',
      })
    })

    return () => cancelAnimationFrame(raf)
  }, [rect, hasSelection])

  const floatingStyles = !rect || !hasSelection ? hiddenStyles : positionedStyles

  const [ttsState, setTtsState] = useState<TtsState>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const cleanup = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const handleTts = async () => {
    if (ttsState === 'playing') {
      cleanup()
      setTtsState('idle')
      return
    }

    if (ttsState === 'loading') return

    setTtsState('loading')
    try {
      const result = await ttsSynthesizeFn({ data: { text } })

      const hexStr = result.audio
      const bytes = new Uint8Array(hexStr.length / 2)
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
      }

      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio

      audio.addEventListener('ended', () => {
        cleanup()
        setTtsState('idle')
      })

      audio.addEventListener('error', () => {
        cleanup()
        setTtsState('idle')
        toast.error('音频播放失败')
      })

      await audio.play()
      setTtsState('playing')
    } catch (error) {
      cleanup()
      setTtsState('idle')
      const message = error instanceof Error ? error.message : '语音合成失败'
      toast.error(message)
    }
  }

  const ttsIcon = () => {
    switch (ttsState) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'playing':
        return <Square className="h-3 w-3" />
      default:
        return <Volume2 className="h-4 w-4" />
    }
  }

  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          ref={floatingRef}
          style={floatingStyles}
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="flex gap-1 rounded-lg bg-background/80 p-1 shadow-lg backdrop-blur-md border border-border/50"
          data-selection-toolbar
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleQuote}
            className="h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
          >
            <Quote className="h-3.5 w-3.5" />
            引用
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleTts}
            disabled={ttsState === 'loading'}
            className="h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
          >
            {ttsIcon()}
            {ttsState === 'playing' ? '停止' : '朗读'}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
