import { toPng } from 'html-to-image'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Message } from '@/types/message'
import type { ConversationShareStatus } from '@/types/share'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { useConversationsStore } from '@/stores/useConversationsStore'
import { toast } from '@/hooks/useToast'
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
import {
  createConversationShareFn,
  getConversationShareFn,
  revokeConversationShareFn,
} from '@/server/functions/shares'
import { SharedConversationView, type ShareRenderableMessage } from './SharedConversationView'

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

const buildShareUrl = (token: string) => {
  const path = `/share/${encodeURIComponent(token)}`
  if (typeof window === 'undefined') {
    return path
  }
  return `${window.location.origin}${path}`
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

  const [shareStatus, setShareStatus] = useState<ConversationShareStatus>('not_shared')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareActionLoading, setShareActionLoading] = useState<'create' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)

  const pathMessages = currentPath
    .map((id, pathIndex) => {
      const message = messages[id - 1]
      if (!message) return null
      return { id, pathIndex, message } satisfies ShareablePathMessage
    })
    .filter((item): item is ShareablePathMessage => item !== null)

  const selectedMessages = pathMessages.filter(({ id }) => selectedIds.has(id))

  const selectedCount = selectedMessages.length

  const selectedRenderableMessages = selectedMessages.map(({ message }) => ({
    id: message.id,
    role: message.role,
    blocks: message.blocks,
  })) as ShareRenderableMessage[]

  const conversationTitle = (() => {
    if (!conversationId) {
      return 'Aether'
    }

    const conversation = conversations.find((item) => item.id === conversationId)
    return conversation?.title?.trim() || 'Aether'
  })()

  const shareUrl = shareToken ? buildShareUrl(shareToken) : null

  const resetState = () => {
    setStep('select')
    setSelectedIds(new Set())
    setPreviewDataUrl(null)
    setIsGenerating(false)
    setError(null)
    setShareStatus('not_shared')
    setShareToken(null)
    setShareLoading(false)
    setShareActionLoading(null)
    setCopied(false)
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState()
    }
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open) {
      return
    }
    if (!conversationId) {
      setShareStatus('not_shared')
      setShareToken(null)
      return
    }

    void (async () => {
      setShareLoading(true)
      try {
        const result = await getConversationShareFn({
          data: {
            conversationId,
          },
        })

        setShareStatus(result.status)
        setShareToken(result.token ?? null)
      } catch (loadError) {
        console.error('Failed to load share status', loadError)
        toast.error('读取分享状态失败')
        setShareStatus('not_shared')
        setShareToken(null)
      } finally {
        setShareLoading(false)
      }
    })()
  }, [open, conversationId])

  const toggleMessageSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(pathMessages.map((item) => item.id)))
  }

  const handleClearAll = () => {
    setSelectedIds(new Set())
  }

  const handleCreateOrReactivateShare = async () => {
    if (!conversationId) {
      toast.error('当前会话不可分享')
      return
    }
    if (pathMessages.length === 0) {
      toast.warning('当前没有可分享的消息')
      return
    }

    setShareActionLoading('create')
    try {
      const result = await createConversationShareFn({
        data: {
          conversationId,
          title: conversationTitle,
        },
      })

      setShareStatus('active')
      setShareToken(result.token)
      toast.success('URL 分享已开启')
    } catch (createError) {
      console.error('Failed to create share', createError)
      toast.error('开启分享失败，请重试')
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
      await revokeConversationShareFn({
        data: {
          conversationId,
        },
      })
      setShareStatus('revoked')
      toast.success('已取消 URL 分享')
    } catch (revokeError) {
      console.error('Failed to revoke share', revokeError)
      toast.error('取消分享失败，请重试')
    } finally {
      setShareActionLoading(null)
    }
  }

  const handleCopyShareUrl = async () => {
    if (!shareUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('分享链接已复制')
      setTimeout(() => setCopied(false), 1200)
    } catch (copyError) {
      console.error('Failed to copy share url', copyError)
      toast.error('复制失败，请手动复制')
    }
  }

  const generatePreview = async () => {
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
    } catch (previewError) {
      console.error('Failed to generate share preview', previewError)
      setError('导出失败，请重试')
    } finally {
      restoreCrossOriginImages?.()
      setIsGenerating(false)
    }
  }

  const handleDownload = () => {
    if (!previewDataUrl) {
      return
    }

    const titlePart = sanitizeFilename(conversationTitle)
    const filename = `Aether-${titlePart}.png`
    downloadDataUrl(previewDataUrl, filename)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className='max-h-[90vh] sm:max-w-4xl px-8 py-8'>
        <DialogHeader className='space-y-1'>
          <DialogTitle className='text-xl font-medium tracking-tight'>
            {step === 'select' ? '分享' : '预览'}
          </DialogTitle>
          <DialogDescription className='text-(--text-tertiary)'>
            {step === 'select'
              ? '开启 URL 分享或导出 PNG 图片'
              : '确认后下载 PNG 图片'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className='space-y-6'>
            <section className='rounded-xl border border-border bg-(--surface-muted)/20 p-4 space-y-3'>
              <div className='flex items-center gap-2 text-sm font-medium text-(--text-primary)'>
                <Link2 className='h-4 w-4' />
                URL 分享
              </div>

              {shareLoading ? (
                <div className='flex items-center gap-2 text-sm text-(--text-tertiary)'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  读取分享状态...
                </div>
              ) : shareStatus === 'active' && shareUrl ? (
                <div className='space-y-3'>
                  <div className='rounded-lg border border-border bg-background px-3 py-2 text-sm text-(--text-secondary) break-all'>
                    {shareUrl}
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={handleCopyShareUrl}
                      disabled={shareActionLoading !== null}
                    >
                      {copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
                      {copied ? '已复制' : '复制链接'}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={handleRevokeShare}
                      disabled={shareActionLoading !== null}
                      className='text-destructive'
                    >
                      {shareActionLoading === 'revoke' ? (
                        <>
                          <Loader2 className='h-4 w-4 animate-spin' />
                          取消中
                        </>
                      ) : (
                        <>
                          <XCircle className='h-4 w-4' />
                          取消分享
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='flex flex-wrap items-center gap-2'>
                  {shareStatus === 'revoked' ? (
                    <span className='text-sm text-(--text-tertiary)'>该链接已取消，可重新开启</span>
                  ) : (
                    <span className='text-sm text-(--text-tertiary)'>开启后可通过 URL 公开访问</span>
                  )}
                  <Button
                    type='button'
                    size='sm'
                    onClick={handleCreateOrReactivateShare}
                    disabled={shareActionLoading !== null || pending || pathMessages.length === 0}
                  >
                    {shareActionLoading === 'create' ? (
                      <>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        处理中
                      </>
                    ) : shareStatus === 'revoked' ? (
                      '重新开启分享'
                    ) : (
                      '开启 URL 分享'
                    )}
                  </Button>
                </div>
              )}
            </section>

            <section className='space-y-5'>
              <div className='flex items-center justify-between gap-4'>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={handleSelectAll}
                    disabled={pathMessages.length === 0}
                    className='text-(--text-secondary) hover:text-(--text-primary)'
                  >
                    全选
                  </Button>
                  {selectedCount > 0 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={handleClearAll}
                      className='text-(--text-tertiary) hover:text-(--text-primary)'
                    >
                      清除
                    </Button>
                  )}
                </div>
                <span className='text-xs text-(--text-tertiary)'>
                  已选 {selectedCount} 则
                </span>
              </div>

              <div className='max-h-[44vh] overflow-y-auto -mx-1 px-1'>
                {pathMessages.length === 0 ? (
                  <div className='py-12 text-center text-sm text-(--text-tertiary)'>
                    当前没有可分享的消息
                  </div>
                ) : (
                  <div className='space-y-px'>
                    {pathMessages.map(({ id, message, pathIndex }) => {
                      const isSelected = selectedIds.has(id)
                      const snippet = buildMessageSnippet(message)

                      return (
                        <button
                          key={id}
                          type='button'
                          onClick={() => toggleMessageSelection(id)}
                          className={cn(
                            'flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-2 px-4 py-3.5 text-left transition-colors',
                            isSelected
                              ? 'border-l-(--interactive-primary) bg-(--surface-muted)/50'
                              : 'border-l-transparent hover:bg-(--surface-hover)'
                          )}
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2 text-xs text-(--text-tertiary)'>
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
                            <p className='mt-1 line-clamp-2 text-sm text-(--text-secondary)'>
                              {snippet}
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
        ) : (
          <div className='space-y-5'>
            <div className='max-h-[58vh] overflow-auto rounded-xl bg-(--surface-muted)/20 py-6 px-6'>
              {isGenerating ? (
                <div className='flex min-h-64 flex-col items-center justify-center gap-3 text-(--text-tertiary)'>
                  <Loader2 className='h-6 w-6 animate-spin' />
                  <span className='text-sm'>正在生成</span>
                </div>
              ) : error ? (
                <div className='flex min-h-64 flex-col items-center justify-center gap-3 text-sm'>
                  <AlertCircle className='h-5 w-5 text-destructive' />
                  <p className='text-destructive'>{error}</p>
                </div>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt='分享图片预览'
                  className='mx-auto h-auto w-full max-w-2xl rounded-lg shadow-sm'
                />
              ) : (
                <div className='flex min-h-64 items-center justify-center text-sm text-(--text-tertiary)'>
                  暂无预览
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className='gap-2 sm:gap-2'>
          {step === 'select' ? (
            <>
              <Button
                type='button'
                variant='ghost'
                onClick={() => handleDialogOpenChange(false)}
                className='text-(--text-secondary)'
              >
                取消
              </Button>
              <Button
                type='button'
                onClick={generatePreview}
                disabled={selectedCount === 0 || isGenerating || pending}
                className='min-w-24'
              >
                {isGenerating ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
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
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => setStep('select')}
                disabled={isGenerating}
                className='shrink-0'
                title='返回选择'
              >
                <ArrowLeft className='h-4 w-4' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                onClick={generatePreview}
                disabled={isGenerating || pending}
                className='text-(--text-secondary)'
              >
                {isGenerating ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    生成中
                  </>
                ) : (
                  '重新生成'
                )}
              </Button>
              <Button
                type='button'
                onClick={handleDownload}
                disabled={!previewDataUrl || isGenerating}
                className='min-w-28'
              >
                <Download className='h-4 w-4' />
                下载
              </Button>
            </>
          )}
        </DialogFooter>

        <div
          aria-hidden
          className='pointer-events-none fixed -left-3000 top-0 opacity-100'
        >
          <div
            ref={captureRef}
            className='w-250 rounded-2xl border border-border bg-background p-10 text-foreground'
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <SharedConversationView messages={selectedRenderableMessages} />

            <footer className='mt-6 border-t border-border pt-4 text-sm text-muted-foreground'>
              Exported from Aether
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
