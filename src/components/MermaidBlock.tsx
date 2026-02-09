'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type MermaidBlockProps = {
  code: string
}

let mermaidPromise: Promise<typeof import('mermaid')> | null = null

const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
  }
  return mermaidPromise
}

const isDarkTheme = () =>
  typeof document !== 'undefined' &&
  document.documentElement.classList.contains('dark')

let renderCounter = 0

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const prevCodeRef = useRef('')
  const prevThemeRef = useRef<boolean | null>(null)

  const renderDiagram = useCallback(async (source: string) => {
    if (!containerRef.current) return
    try {
      const { default: mermaid } = await getMermaid()
      const dark = isDarkTheme()
      mermaid.initialize({
        startOnLoad: false,
        look: 'handDrawn',
        theme: dark ? 'dark' : 'neutral',
        darkMode: dark,
      })

      const id = `mermaid-${++renderCounter}`
      const { svg } = await mermaid.render(id, source)
      if (containerRef.current) {
        containerRef.current.innerHTML = svg
        setStatus('success')
        setErrorMsg('')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : '渲染失败')
    }
  }, [])

  // Render on code change with debounce
  useEffect(() => {
    if (!code.trim()) return

    if (code === prevCodeRef.current && isDarkTheme() === prevThemeRef.current)
      return

    prevCodeRef.current = code
    prevThemeRef.current = isDarkTheme()

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      renderDiagram(code)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [code, renderDiagram])

  // Watch theme changes via MutationObserver
  useEffect(() => {
    if (typeof document === 'undefined') return

    const observer = new MutationObserver(() => {
      const dark = isDarkTheme()
      if (dark !== prevThemeRef.current && code.trim()) {
        prevThemeRef.current = dark
        renderDiagram(code)
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [code, renderDiagram])

  const handleCopy = async () => {
    if (!code.trim() || typeof navigator === 'undefined') return
    try {
      await navigator.clipboard.writeText(code)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  return (
    <div className="group relative w-full max-w-full overflow-hidden rounded-lg border bg-muted/50">
      <div className="sticky top-2 float-right mr-2 mt-2 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title="复制到剪贴板"
          aria-label="复制到剪贴板"
          className="h-7 gap-1 px-2 text-[11px] bg-transparent"
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isCopied ? '已复制' : '复制'}
          </span>
        </Button>
      </div>

      <div className="px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          MERMAID
        </span>
      </div>

      <div
        ref={containerRef}
        className={cn(
          'flex justify-center overflow-x-auto p-4',
          status === 'loading' && 'min-h-[100px] items-center'
        )}
      >
        {status === 'loading' && (
          <div className="text-sm text-muted-foreground animate-pulse">
            加载图表中...
          </div>
        )}
      </div>

      {status === 'error' && (
        <div className="px-4 pb-4">
          <div className="mb-2 text-xs text-destructive">{errorMsg}</div>
          <pre className="max-w-full overflow-x-auto rounded bg-muted p-3 text-xs text-muted-foreground">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
