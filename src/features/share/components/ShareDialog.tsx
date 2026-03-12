import { toPng } from 'html-to-image'
import { Check, Copy, Download, Link2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ReadonlyMessageList } from '@/features/share/components/ReadonlyMessageList'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import {
  buildMessageSnippet,
  downloadDataUrl,
  prepareCrossOriginImagesForExport,
  sanitizeFilename,
  waitForImages,
} from '@/lib/chat/export-utils'
import { cn } from '@/lib/utils'
import {
  createConversationShareFn,
  getConversationShareFn,
  revokeConversationShareFn,
} from '@/server/functions/shares'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import { useChatSessionStore } from '@/stores/zustand/useChatSessionStore'
import type { Message } from '@/types/message'
import type { ConversationShareStatus } from '@/types/share'

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
  user: 'User',
  assistant: 'Assistant',
}

const EXPORT_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

const capturePixelRatio = () => {
  if (typeof window === 'undefined') {
    return 1
  }

  const dpr = window.devicePixelRatio || 1
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return Math.min(coarse ? 1 : 2, dpr)
}

const waitForFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

const buildShareUrl = (token: string) =>
  typeof window === 'undefined'
    ? `/share/${encodeURIComponent(token)}`
    : `${window.location.origin}/share/${encodeURIComponent(token)}`

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const messages = useChatSessionStore((state) => state.messages)
  const currentPath = useChatSessionStore((state) => state.currentPath)
  const conversationId = useChatSessionStore((state) => state.conversationId)
  const conversations = useChatSessionStore((state) => state.conversations)
  const requestPhase = useChatRequestStore((state) => state.requestPhase)
  const isBusy = requestPhase !== 'done'

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [shareStatus, setShareStatus] =
    useState<ConversationShareStatus>('not_shared')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareActionLoading, setShareActionLoading] = useState<
    'create' | 'revoke' | null
  >(null)
  const [copied, setCopied] = useState(false)
  const captureRef = useRef<HTMLDivElement | null>(null)

  const pathMessages = currentPath
    .map((id, pathIndex) => {
      const message = messages[id - 1]
      return message ? { id, pathIndex, message } : null
    })
    .filter((item): item is ShareablePathMessage => item !== null)

  const selectedMessages = pathMessages.filter(({ id }) => selectedIds.has(id))
  const selectedCount = selectedMessages.length
  const selectedPreviewMessages = selectedMessages.map(
    ({ message }) => message,
  )

  const conversationTitle = (() => {
    if (!conversationId) {
      return 'Aether'
    }

    const conversation = conversations.find((item) => item.id === conversationId)
    return conversation?.title?.trim() || 'Aether'
  })()

  const shareUrl = shareToken ? buildShareUrl(shareToken) : null

  const resetState = () => {
    setSelectedIds(new Set())
    setIsGenerating(false)
    setShareStatus('not_shared')
    setShareToken(null)
    setShareLoading(false)
    setShareActionLoading(null)
    setCopied(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState()
    }
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open || !conversationId) {
      if (open && !conversationId) {
        setShareStatus('not_shared')
        setShareToken(null)
      }
      return
    }

    let cancelled = false
    setShareLoading(true)

    getConversationShareFn({ data: { conversationId } })
      .then((result) => {
        if (!cancelled) {
          setShareStatus(result.status)
          setShareToken(result.token ?? null)
        }
      })
      .catch((error) => {
        console.error('Failed to load share status', error)
        if (!cancelled) {
          toast.error('Failed to load share status')
          setShareStatus('not_shared')
          setShareToken(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setShareLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, conversationId])

  const toggleSelection = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleCreateShare = async () => {
    if (!conversationId) {
      toast.error('No conversation selected')
      return
    }

    if (pathMessages.length === 0) {
      toast.warning('There are no messages to share')
      return
    }

    setShareActionLoading('create')
    try {
      const result = await createConversationShareFn({
        data: { conversationId, title: conversationTitle },
      })
      setShareStatus('active')
      setShareToken(result.token)
      toast.success('Share URL created')
    } catch (error) {
      console.error('Failed to create share', error)
      toast.error('Failed to create share URL')
    } finally {
      setShareActionLoading(null)
    }
  }

  const handleRevokeShare = async () => {
    if (!conversationId) {
      return
    }

    setShareActionLoading('revoke')
    try {
      await revokeConversationShareFn({ data: { conversationId } })
      setShareStatus('revoked')
      toast.success('Share URL revoked')
    } catch (error) {
      console.error('Failed to revoke share', error)
      toast.error('Failed to revoke share URL')
    } finally {
      setShareActionLoading(null)
    }
  }

  const handleCopyUrl = async () => {
    if (!shareUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Share URL copied')
      setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error('Failed to copy', error)
      toast.error('Failed to copy share URL')
    }
  }

  const handleDownload = async () => {
    if (selectedCount === 0) {
      return
    }

    setIsGenerating(true)
    let restore: (() => void) | null = null

    try {
      await document.fonts?.ready
      await waitForFrames()
      const node = captureRef.current
      if (!node) {
        throw new Error('capture node not ready')
      }

      restore = await prepareCrossOriginImagesForExport(node)
      await waitForImages(node)

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: capturePixelRatio(),
        fontEmbedCSS: '',
      })
      const filename = `Aether-${sanitizeFilename(conversationTitle)}.png`
      await downloadDataUrl(dataUrl, filename)
      toast.success('Image downloaded')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      console.error('Failed to download', error)
      toast.error('Failed to generate image')
    } finally {
      restore?.()
      setIsGenerating(false)
    }
  }

  const isLoading = shareActionLoading !== null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden px-8 py-8 sm:max-w-4xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-medium tracking-tight">
            Share
          </DialogTitle>
          <DialogDescription className="text-(--text-tertiary)">
            Create a shareable URL or export selected messages as a PNG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border border-border bg-(--surface-muted)/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
              <Link2 className="h-4 w-4" />
              Share URL
            </div>

            {shareLoading ? (
              <div className="flex items-center gap-2 text-sm text-(--text-tertiary)">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading share status...
              </div>
            ) : shareStatus === 'active' && shareUrl ? (
              <div className="space-y-3">
                <div className="break-all rounded-lg border border-border bg-background px-3 py-2 text-sm text-(--text-secondary)">
                  {shareUrl}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyUrl}
                    disabled={isLoading}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy URL'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRevokeShare}
                    disabled={isLoading}
                    className="text-destructive"
                  >
                    {shareActionLoading === 'revoke' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Revoking...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Revoke
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-(--text-tertiary)">
                  {shareStatus === 'revoked'
                    ? 'This share URL was revoked. Create a new one if needed.'
                    : 'Create a shareable URL for this conversation.'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateShare}
                  disabled={isLoading || isBusy || pathMessages.length === 0}
                >
                  {shareActionLoading === 'create' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : shareStatus === 'revoked' ? (
                    'Create New URL'
                  ) : (
                    'Create URL'
                  )}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <div className="max-h-[44vh] overflow-y-auto px-1">
              {pathMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-(--text-tertiary)">
                  No messages available to share.
                </div>
              ) : (
                <div className="space-y-px">
                  {pathMessages.map(({ id, message, pathIndex }) => {
                    const isSelected = selectedIds.has(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSelection(id)}
                        className={cn(
                          'flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-2 px-4 py-3.5 text-left transition-colors',
                          isSelected
                            ? 'border-l-(--interactive-primary) bg-(--surface-muted)/50'
                            : 'border-l-transparent hover:bg-(--surface-hover)',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-(--text-tertiary)">
                            <span
                              className={
                                message.role === 'user'
                                  ? 'font-medium text-(--text-secondary)'
                                  : ''
                              }
                            >
                              {ROLE_LABEL[message.role]}
                            </span>
                            <span>Path</span>
                            <span>#{pathIndex + 1}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-(--text-secondary)">
                            {buildMessageSnippet(message)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="text-(--text-secondary)"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={selectedCount === 0 || isGenerating || isBusy}
            className="min-w-24"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download PNG
              </>
            )}
          </Button>
        </DialogFooter>

        <div
          aria-hidden
          className="pointer-events-none fixed -left-3000 top-0 opacity-100"
        >
          <div
            ref={captureRef}
            className="rounded-2xl border border-border bg-background p-6 text-foreground"
            style={{ width: 390, fontFamily: EXPORT_FONT }}
          >
            <div className="pb-6">
              <ReadonlyMessageList messages={selectedPreviewMessages} isPhone />
            </div>
            <footer className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
              Exported from Aether
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
