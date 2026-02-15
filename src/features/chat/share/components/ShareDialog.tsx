'use client'

import { toPng } from 'html-to-image'
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Message } from '@/features/chat/types/chat'
import { useChatRequestStore } from '@/features/chat/api/store/useChatRequestStore'
import { useMessageTreeStore } from '@/features/chat/messages/store/useMessageTreeStore'
import { ResearchBlock } from '@/features/chat/messages/components/research/ResearchBlock'
import { useConversationsStore } from '@/features/conversation/persistence/store/useConversationsStore'
import Markdown from '@/shared/components/Markdown'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  buildFontEmbedCSS,
  buildMessageSnippet,
  downloadDataUrl,
  formatTimestampForFilename,
  sanitizeFilename,
  waitForImages,
} from '@/features/chat/share/lib/export-utils'

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

  const handleInvertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<number>()
      for (const item of pathMessages) {
        if (!prev.has(item.id)) {
          next.add(item.id)
        }
      }
      return next
    })
  }, [pathMessages])

  const generatePreview = useCallback(async () => {
    if (selectedCount === 0) {
      return
    }

    setStep('preview')
    setPreviewDataUrl(null)
    setError(null)
    setIsGenerating(true)

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready
      }
      await waitForFrames()

      const captureNode = captureRef.current
      if (!captureNode) {
        throw new Error('capture node is not ready')
      }

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
      setIsGenerating(false)
    }
  }, [selectedCount])

  const handleDownload = useCallback(() => {
    if (!previewDataUrl) {
      return
    }

    const titlePart = sanitizeFilename(conversationTitle)
    const timestamp = formatTimestampForFilename(new Date())
    const filename = `Aether-${titlePart}-${timestamp}.png`
    downloadDataUrl(previewDataUrl, filename)
  }, [conversationTitle, previewDataUrl])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{step === 'select' ? '分享对话消息' : '导出预览'}</DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? '勾选要分享的消息后生成图片预览。'
              : '确认预览后即可下载 PNG 图片。'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={pathMessages.length === 0}
              >
                全选
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={selectedIds.size === 0}
              >
                清空
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleInvertSelection}
                disabled={pathMessages.length === 0}
              >
                反选
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                已选 {selectedCount} / {pathMessages.length}
              </span>
            </div>

            <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-border">
              {pathMessages.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  当前没有可分享的消息。
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pathMessages.map(({ id, message, pathIndex }) => {
                    const isChecked = selectedIds.has(id)
                    const snippet = buildMessageSnippet(message)

                    return (
                      <label
                        key={id}
                        htmlFor={`share-message-${id}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors',
                          isChecked
                            ? 'bg-(--surface-muted)'
                            : 'hover:bg-(--surface-hover)'
                        )}
                      >
                        <input
                          id={`share-message-${id}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMessageSelection(id)}
                          className="mt-1 h-4 w-4 rounded border-border bg-transparent"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px]">
                              {ROLE_LABEL[message.role]}
                            </span>
                            <span>#{pathIndex + 1}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-(--text-secondary)">
                            {snippet}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[58vh] overflow-auto rounded-lg border border-border bg-(--surface-muted)/30 p-3">
              {isGenerating ? (
                <div className="flex min-h-70 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在生成预览...</span>
                </div>
              ) : error ? (
                <div className="flex min-h-70 flex-col items-center justify-center gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-destructive">{error}</p>
                </div>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="分享图片预览"
                  className="mx-auto h-auto w-full rounded-md border border-border bg-background"
                />
              ) : (
                <div className="flex min-h-70 items-center justify-center text-sm text-muted-foreground">
                  暂无预览
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'select' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={generatePreview}
                disabled={selectedCount === 0 || isGenerating || pending}
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
                variant="outline"
                onClick={() => setStep('select')}
                disabled={isGenerating}
              >
                <ArrowLeft className="h-4 w-4" />
                返回选择
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={generatePreview}
                disabled={isGenerating || pending}
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
              >
                <Download className="h-4 w-4" />
                下载图片
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
            className="w-225 rounded-2xl border border-border bg-background p-8 text-foreground"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <header className="mb-6 border-b border-border pb-4">
              <h2 className="text-xl font-semibold text-foreground">
                {conversationTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Exported at {new Date().toLocaleString()}
              </p>
            </header>

            <section className="space-y-5">
              {selectedMessages.map(({ id, message, pathIndex }) => (
                <article
                  key={id}
                  className="rounded-xl border border-border bg-(--surface-secondary) p-4"
                >
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border px-2 py-0.5 text-[10px]">
                      {ROLE_LABEL[message.role]}
                    </span>
                    <span>#{pathIndex + 1}</span>
                  </div>

                  <div className="space-y-3">
                    {message.blocks.map((block, blockIndex) => {
                      if (block.type === 'content') {
                        return (
                          <div
                            key={`${id}-content-${blockIndex}`}
                            className={cn(
                              'text-base leading-relaxed wrap-anywhere [&_pre]:wrap-normal [&_.markdown-body]:text-base [&_.markdown-body]:leading-relaxed [&_.markdown-body]:wrap-anywhere',
                              message.role === 'user'
                                ? 'text-foreground [&_.markdown-body]:text-foreground'
                                : 'text-(--text-secondary) [&_.markdown-body]:text-(--text-secondary)'
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
                            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
                                <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate">
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

            <footer className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              Exported from Aether
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
