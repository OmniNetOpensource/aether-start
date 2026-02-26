
import { toPng } from 'html-to-image'
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Message } from '@/types/message'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { ResearchBlock } from './ResearchBlock'
import { useConversationsStore } from '@/stores/useConversationsStore'
import Markdown from '@/components/Markdown'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildFontEmbedCSS,
  buildMessageSnippet,
  downloadDataUrl,
  prepareCrossOriginImagesForExport,
  sanitizeFilename,
  waitForImages,
} from '@/lib/chat/export-utils'

type ShareStep = 'select' | 'preview'

type ShareablePathMessage = {
  id: number
  pathIndex: number
  message: Message
}

export type ShareDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ROLE_LABEL: Record<Message['role'], string> = {
  user: '用户',
  assistant: '助手',
}

const capturePixelRatio = () =>
  Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)

const waitForFrames = async () => {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
}

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const messages = useMessageTreeStore((state) => state.messages)
  const currentPath = useMessageTreeStore((state) => state.currentPath)
  const conversationId = useMessageTreeStore((state) => state.conversationId)
  const pending = useChatRequestStore((state) => state.pending)
  const conversations = useConversationsStore((state) => state.conversations)

  const [step, setStep] = useState<ShareStep>('select')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement | null>(null)

  const pathMessages = useMemo(() => {
    return currentPath
      .map((id, pathIndex) => {
        const message = messages[id - 1]
        if (!message) return null
        return { id, pathIndex, message } satisfies ShareablePathMessage
      })
      .filter((item): item is ShareablePathMessage => item !== null)
  }, [currentPath, messages])

  const selectedMessages = useMemo(
    () => pathMessages.filter(({ id }) => selectedIds.has(id)),
    [pathMessages, selectedIds]
  )

  const selectedCount = selectedMessages.length

  const conversationTitle = useMemo(() => {
    if (!conversationId) {
      return 'Aether'
    }

    const conversation = conversations.find((item) => item.id === conversationId)
    return conversation?.title?.trim() || 'Aether'
  }, [conversationId, conversations])

  const resetState = useCallback(() => {
    setStep('select')
    setSelectedIds(new Set())
    setPreviewDataUrl(null)
    setIsGenerating(false)
    setError(null)
  }, [])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetState()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetState]
  )

  const toggleMessageSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(pathMessages.map((item) => item.id)))
  }, [pathMessages])

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const generatePreview = useCallback(async () => {
    if (selectedCount === 0) {
      return
    }

    setStep('preview')
    setPreviewDataUrl(null)
    setError(null)
    setIsGenerating(true)

    let restoreCrossOriginImages: (() => void) | null = null

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready
      }
      await waitForFrames()

      const captureNode = captureRef.current
      if (!captureNode) {
        throw new Error('capture node is not ready')
      }

      restoreCrossOriginImages = await prepareCrossOriginImagesForExport(captureNode)
      await waitForImages(captureNode)

      const fontEmbedCSS = await buildFontEmbedCSS()
      const dataUrl = await toPng(captureNode, {
        cacheBust: true,
        pixelRatio: capturePixelRatio(),
        fontEmbedCSS,
      })
      setPreviewDataUrl(dataUrl)
    } catch (err) {
      console.error('Failed to generate share preview', err)
      setError('导出失败，请重试')
    } finally {
      restoreCrossOriginImages?.()
      setIsGenerating(false)
    }
  }, [selectedCount])

  const handleDownload = useCallback(() => {
    if (!previewDataUrl) {
      return
    }

    const titlePart = sanitizeFilename(conversationTitle)
    const filename = `Aether-${titlePart}.png`
    downloadDataUrl(previewDataUrl, filename)
  }, [conversationTitle, previewDataUrl])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl px-8 py-8">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-medium tracking-tight">
            {step === 'select' ? '分享' : '预览'}
          </DialogTitle>
          <DialogDescription className="text-(--text-tertiary)">
            {step === 'select'
              ? '选择要导出的消息'
              : '确认后下载 PNG 图片'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={pathMessages.length === 0}
                  className="text-(--text-secondary) hover:text-(--text-primary)"
                >
                  全选
                </Button>
                {selectedCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-(--text-tertiary) hover:text-(--text-primary)"
                  >
                    清除
                  </Button>
                )}
              </div>
              <span className="text-xs text-(--text-tertiary)">
                已选 {selectedCount} 则
              </span>
            </div>

            <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
              {pathMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-(--text-tertiary)">
                  当前没有可分享的消息
                </div>
              ) : (
                <div className="space-y-px">
                  {pathMessages.map(({ id, message, pathIndex }) => {
                    const isSelected = selectedIds.has(id)
                    const snippet = buildMessageSnippet(message)

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleMessageSelection(id)}
                        className={cn(
                          'flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-2 px-4 py-3.5 text-left transition-colors',
                          isSelected
                            ? 'border-l-(--interactive-primary) bg-(--surface-muted)/50'
                            : 'border-l-transparent hover:bg-(--surface-hover)'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-(--text-tertiary)">
                            <span
                              className={cn(
                                message.role === 'user'
                                  ? 'font-medium text-(--text-secondary)'
                                  : ''
                              )}
                            >
                              {ROLE_LABEL[message.role]}
                            </span>
                            <span>·</span>
                            <span>#{pathIndex + 1}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-(--text-secondary)">
                            {snippet}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="max-h-[58vh] overflow-auto rounded-xl bg-(--surface-muted)/20 py-6 px-6">
              {isGenerating ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-(--text-tertiary)">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">正在生成</span>
                </div>
              ) : error ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-destructive">{error}</p>
                </div>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="分享图片预览"
                  className="mx-auto h-auto w-full max-w-2xl rounded-lg shadow-sm"
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-sm text-(--text-tertiary)">
                  暂无预览
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'select' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleDialogOpenChange(false)}
                className="text-(--text-secondary)"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={generatePreview}
                disabled={selectedCount === 0 || isGenerating || pending}
                className="min-w-24"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中
                  </>
                ) : (
                  '生成预览'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setStep('select')}
                disabled={isGenerating}
                className="shrink-0"
                title="返回选择"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={generatePreview}
                disabled={isGenerating || pending}
                className="text-(--text-secondary)"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中
                  </>
                ) : (
                  '重新生成'
                )}
              </Button>
              <Button
                type="button"
                onClick={handleDownload}
                disabled={!previewDataUrl || isGenerating}
                className="min-w-28"
              >
                <Download className="h-4 w-4" />
                下载
              </Button>
            </>
          )}
        </DialogFooter>

        <div
          aria-hidden
          className="pointer-events-none fixed -left-3000 top-0 opacity-100"
        >
          <div
            ref={captureRef}
            className="w-250 rounded-2xl border border-border bg-background p-10 text-foreground"
            style={{ fontFamily: 'var(--font-body)' }}
          >

            <section className="space-y-5">
              {selectedMessages.map(({ id, message, pathIndex }) => (
                <article
                  key={id}
                  className={cn(
                    'rounded-xl p-4',
                    message.role === 'user'
                      ? 'border border-border bg-(--surface-secondary) ml-auto max-w-[60%] w-full text-left'
                      : ''
                  )}
                >

                  <div className="space-y-3">
                    {message.blocks.map((block, blockIndex) => {
                      if (block.type === 'content') {
                        return (
                          <div
                            key={`${id}-content-${blockIndex}`}
                            className={cn(
                              'text-lg leading-relaxed wrap-anywhere [&_pre]:wrap-normal',
                              message.role === 'user'
                                ? 'text-foreground'
                                : 'text-(--text-secondary)'
                            )}
                          >
                            <Markdown content={block.content} />
                          </div>
                        )
                      }

                      if (block.type === 'research') {
                        return (
                          <ResearchBlock
                            key={`${id}-research-${blockIndex}`}
                            items={block.items}
                            blockIndex={blockIndex}
                            messageIndex={pathIndex}
                          />
                        )
                      }

                      if (block.type === 'error') {
                        return (
                          <div
                            key={`${id}-error-${blockIndex}`}
                            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-base text-destructive"
                          >
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="whitespace-pre-wrap">
                              {block.message}
                            </div>
                          </div>
                        )
                      }

                      if (block.type === 'attachments') {
                        if (block.attachments.length === 0) {
                          return null
                        }

                        return (
                          <div
                            key={`${id}-attachments-${blockIndex}`}
                            className="grid grid-cols-3 gap-3"
                          >
                            {block.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="overflow-hidden rounded-lg border border-border bg-background"
                              >
                                <img
                                  src={attachment.url}
                                  alt={attachment.name}
                                  className="h-28 w-full object-cover"
                                />
                                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                                  {attachment.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }

                      return null
                    })}
                  </div>
                </article>
              ))}
            </section>

            <footer className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
              Exported from Aether
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
