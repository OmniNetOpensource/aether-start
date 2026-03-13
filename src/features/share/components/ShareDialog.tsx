import { toPng } from 'html-to-image'
import {
  Check,
  CheckSquare2,
  Copy,
  Download,
  Link2,
  Loader2,
  Square,
  XCircle,
} from 'lucide-react'
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
  if (typeof window === 'undefined') return 1
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
  const status = useChatRequestStore((state) => state.status)
  const isBusy = status !== 'idle'

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
  const selectedPreviewMessages = selectedMessages.map(({ message }) => message)
  const allSelected =
    pathMessages.length > 0 && selectedIds.size === pathMessages.length

  const conversationTitle = (() => {
    if (!conversationId) return 'Aether'
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
    if (!nextOpen) resetState()
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
        if (!cancelled) setShareLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, conversationId])

  const toggleSelection = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(pathMessages.map(({ id }) => id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
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
    if (!conversationId) return

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
    if (!shareUrl) return

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
    if (selectedCount === 0) return

    setIsGenerating(true)
    let restore: (() => void) | null = null

    try {
      await document.fonts?.ready
      await waitForFrames()
      const node = captureRef.current
      if (!node) throw new Error('capture node not ready')

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
      if (error instanceof DOMException && error.name === 'AbortError') return
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
      <DialogContent
        className="flex max-h-[90vh] flex-col overflow-hidden px-6 py-6 sm:max-w-2xl"
        aria-describedby="share-dialog-description"
      >
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Share
          </DialogTitle>
          <DialogDescription
            id="share-dialog-description"
            className="text-sm text-(--text-tertiary)"
          >
            Create a public link or export messages as PNG.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
          {/* Share URL section */}
          <section
            className="shrink-0 space-y-3"
            aria-labelledby="share-url-heading"
          >
            <h3
              id="share-url-heading"
              className="flex items-center gap-2 text-sm font-medium text-(--text-primary)"
            >
              <Link2 className="h-4 w-4 shrink-0 text-(--text-tertiary)" />
              Share link
            </h3>

            {shareLoading ? (
              <div
                className="flex h-20 items-center gap-2 rounded-lg border border-border bg-(--surface-muted) px-4"
                aria-live="polite"
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-(--text-tertiary)" />
                <span className="text-sm text-(--text-tertiary)">
                  Loading…
                </span>
              </div>
            ) : shareStatus === 'active' && shareUrl ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-(--text-secondary)">
                    {shareUrl}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyUrl}
                    disabled={isLoading}
                    aria-label={copied ? 'Copied' : 'Copy URL'}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRevokeShare}
                    disabled={isLoading}
                    className="text-(--text-tertiary) hover:text-destructive hover:bg-(--status-destructive-muted)"
                  >
                    {shareActionLoading === 'revoke' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Revoking…
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Revoke link
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-(--text-tertiary)">
                  {shareStatus === 'revoked'
                    ? 'Link was revoked. Create a new one to share again.'
                    : 'Anyone with the link can view this conversation.'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateShare}
                  disabled={isLoading || isBusy || pathMessages.length === 0}
                  className="shrink-0"
                >
                  {shareActionLoading === 'create' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : shareStatus === 'revoked' ? (
                    'Create new link'
                  ) : (
                    'Create link'
                  )}
                </Button>
              </div>
            )}
          </section>

          {/* Divider */}
          <div className="h-px shrink-0 bg-border" role="separator" />

          {/* Export section */}
          <section
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            aria-labelledby="export-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="export-heading"
                className="flex items-center gap-2 text-sm font-medium text-(--text-primary)"
              >
                <Download className="h-4 w-4 shrink-0 text-(--text-tertiary)" />
                Export as image
              </h3>
              {pathMessages.length > 0 && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={allSelected ? clearSelection : selectAll}
                    className="h-7 px-2 text-xs text-(--text-tertiary) hover:text-(--text-secondary)"
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </Button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-(--surface-muted)">
              {pathMessages.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center"
                  role="status"
                >
                  <p className="text-sm text-(--text-tertiary)">
                    No messages in this branch.
                  </p>
                  <p className="text-xs text-(--text-tertiary)">
                    Select a conversation branch to export.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {pathMessages.map(({ id, message, pathIndex }) => {
                    const isSelected = selectedIds.has(id)
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`${isSelected ? 'Deselect' : 'Select'} message ${pathIndex + 1}`}
                          onClick={() => toggleSelection(id)}
                          className={cn(
                            'flex w-full cursor-pointer items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors',
                            'hover:bg-(--surface-hover)',
                            isSelected && 'bg-(--surface-hover)',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 shrink-0',
                              isSelected
                                ? 'text-(--interactive-primary)'
                                : 'text-(--text-tertiary)',
                            )}
                            aria-hidden
                          >
                            {isSelected ? (
                              <CheckSquare2 className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </span>
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
                              <span aria-hidden>·</span>
                              <span>Message {pathIndex + 1}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-(--text-secondary)">
                              {buildMessageSnippet(message)}
                            </p>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {selectedCount > 0 && (
              <p className="shrink-0 text-xs text-(--text-tertiary)">
                {selectedCount} message{selectedCount !== 1 ? 's' : ''} selected
              </p>
            )}
          </section>
        </div>

        <DialogFooter className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-border pt-4">
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
            className="min-w-28"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export PNG
              </>
            )}
          </Button>
        </DialogFooter>

        <div
          aria-hidden
          className="pointer-events-none fixed -left-[3000px] top-0 opacity-100"
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
