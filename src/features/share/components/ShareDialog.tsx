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
import Markdown from '@/components/Markdown'
import { ResearchBlock } from '@/components/chat/research/ResearchBlock'
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
import {
  isChatRequestActive,
  selectChatRequestStatus,
  useChatRequestStore,
} from '@/stores/zustand/useChatRequestStore'
import { useConversationsStore } from '@/stores/zustand/useConversationsStore'
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import type { Message } from '@/types/message'
import type { ConversationShareStatus } from '@/types/share'

// --- Types ---

type ShareStep = 'select' | 'preview'

type ShareablePathMessage = { id: number; pathIndex: number; message: Message }

type ShareRenderableAttachment = {
  id: string
  name: string
  url: string
  thumbnailUrl?: string
}

type ShareRenderableBlock =
  | { type: 'content'; content: string }
  | { type: 'research'; items: Extract<Message['blocks'][number], { type: 'research' }>['items'] }
  | { type: 'error'; message: string }
  | { type: 'attachments'; attachments: ShareRenderableAttachment[] }

export type ShareRenderableMessage = {
  id: number
  role: Message['role']
  blocks: ShareRenderableBlock[]
}

export type ShareDialogProps = { open: boolean; onOpenChange: (open: boolean) => void }

// --- Constants ---

const ROLE_LABEL: Record<Message['role'], string> = { user: '用户', assistant: '助手' }

const EXPORT_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// --- Helpers ---

const capturePixelRatio = () => {
  if (typeof window === 'undefined') return 1
  const dpr = window.devicePixelRatio || 1
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return Math.min(coarse ? 1 : 2, dpr)
}

const waitForFrames = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

const buildShareUrl = (token: string) =>
  typeof window === 'undefined' ? `/share/${encodeURIComponent(token)}` : `${window.location.origin}/share/${encodeURIComponent(token)}`

// --- SharedConversationView (inline, also used by share route) ---

type SharedConversationViewProps = { messages: ShareRenderableMessage[]; className?: string }

export function SharedConversationView({ messages, className }: SharedConversationViewProps) {
  return (
    <section className={cn('space-y-5', className)}>
      {messages.map((message, messageIndex) => (
        <article
          key={message.id}
          className={cn(
            'rounded-xl p-4',
            message.role === 'user' && 'border border-border bg-(--surface-secondary) ml-auto max-w-[60%] w-full text-left'
          )}
        >
          <div className='space-y-3'>
            {message.blocks.map((block, blockIndex) => {
              if (block.type === 'content') {
                return (
                  <div
                    key={`${message.id}-c-${blockIndex}`}
                    className={cn(
                      'text-lg leading-relaxed wrap-anywhere [&_pre]:wrap-normal',
                      message.role === 'user' ? 'text-foreground' : 'text-(--text-secondary)'
                    )}
                  >
                    <Markdown content={block.content} />
                  </div>
                )
              }
              if (block.type === 'research') {
                return (
                  <ResearchBlock
                    key={`${message.id}-r-${blockIndex}`}
                    items={block.items}
                    blockIndex={blockIndex}
                    messageIndex={messageIndex}
                  />
                )
              }
              if (block.type === 'error') {
                return (
                  <div
                    key={`${message.id}-e-${blockIndex}`}
                    className='flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-base text-destructive'
                  >
                    <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                    <div className='whitespace-pre-wrap'>{block.message}</div>
                  </div>
                )
              }
              if (block.type === 'attachments' && block.attachments.length > 0) {
                return (
                  <div key={`${message.id}-a-${blockIndex}`} className='grid grid-cols-3 gap-3'>
                    {block.attachments.map((a) => (
                      <div
                        key={a.id}
                        className='overflow-hidden rounded-lg border border-border bg-background'
                      >
                        <img
                          src={a.thumbnailUrl ?? a.url}
                          alt={a.name}
                          className='h-28 w-full object-cover'
                        />
                        <div className='px-2 py-1.5 text-xs text-muted-foreground truncate'>
                          {a.name}
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
  )
}

// --- ShareDialog ---

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const messages = useMessageTreeStore((s) => s.messages)
  const currentPath = useMessageTreeStore((s) => s.currentPath)
  const conversationId = useMessageTreeStore((s) => s.conversationId)
  const status = useChatRequestStore(selectChatRequestStatus)
  const conversations = useConversationsStore((s) => s.conversations)
  const isBusy = isChatRequestActive(status)

  const [step, setStep] = useState<ShareStep>('select')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<ConversationShareStatus>('not_shared')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareActionLoading, setShareActionLoading] = useState<'create' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)
  const captureRef = useRef<HTMLDivElement | null>(null)

  const pathMessages = currentPath
    .map((id, pathIndex) => {
      const message = messages[id - 1]
      return message ? { id, pathIndex, message } satisfies ShareablePathMessage : null
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
    if (!conversationId) return 'Aether'
    const c = conversations.find((c) => c.id === conversationId)
    return c?.title?.trim() || 'Aether'
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

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState()
    onOpenChange(next)
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
      .then((r) => {
        if (!cancelled) {
          setShareStatus(r.status)
          setShareToken(r.token ?? null)
        }
      })
      .catch((e) => {
        console.error('Failed to load share status', e)
        if (!cancelled) {
          toast.error('读取分享状态失败')
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

  const toggleSelection = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const handleCreateShare = async () => {
    if (!conversationId) return toast.error('当前会话不可分享')
    if (pathMessages.length === 0) return toast.warning('当前没有可分享的消息')
    setShareActionLoading('create')
    try {
      const r = await createConversationShareFn({ data: { conversationId, title: conversationTitle } })
      setShareStatus('active')
      setShareToken(r.token)
      toast.success('URL 分享已开启')
    } catch (e) {
      console.error('Failed to create share', e)
      toast.error('开启分享失败，请重试')
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
      toast.success('已取消 URL 分享')
    } catch (e) {
      console.error('Failed to revoke share', e)
      toast.error('取消分享失败，请重试')
    } finally {
      setShareActionLoading(null)
    }
  }

  const handleCopyUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('分享链接已复制')
      setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      console.error('Failed to copy', e)
      toast.error('复制失败，请手动复制')
    }
  }

  const generatePreview = async () => {
    if (selectedCount === 0) return
    setStep('preview')
    setPreviewDataUrl(null)
    setError(null)
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
      setPreviewDataUrl(dataUrl)
    } catch (e) {
      console.error('Failed to generate preview', e)
      setError('导出失败，请重试')
    } finally {
      restore?.()
      setIsGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!previewDataUrl) return
    const filename = `Aether-${sanitizeFilename(conversationTitle)}.png`
    try {
      await downloadDataUrl(previewDataUrl, filename)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('Failed to download', e)
      toast.error('保存图片失败，请重试')
    }
  }

  const isLoading = shareActionLoading !== null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[90vh] sm:max-w-4xl px-8 py-8'>
        <DialogHeader className='space-y-1'>
          <DialogTitle className='text-xl font-medium tracking-tight'>
            {step === 'select' ? '分享' : '预览'}
          </DialogTitle>
          <DialogDescription className='text-(--text-tertiary)'>
            {step === 'select' ? '开启 URL 分享或导出 PNG 图片' : '确认后下载 PNG 图片'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className='space-y-6'>
            <section className='rounded-xl border border-border bg-(--surface-muted)/20 p-4 space-y-3'>
              <div className='flex items-center gap-2 text-sm font-medium text-(--text-primary)'>
                <Link2 className='h-4 w-4' /> URL 分享
              </div>
              {shareLoading ? (
                <div className='flex items-center gap-2 text-sm text-(--text-tertiary)'>
                  <Loader2 className='h-4 w-4 animate-spin' /> 读取分享状态...
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
                      onClick={handleCopyUrl}
                      disabled={isLoading}
                    >
                      {copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
                      {copied ? '已复制' : '复制链接'}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={handleRevokeShare}
                      disabled={isLoading}
                      className='text-destructive'
                    >
                      {shareActionLoading === 'revoke' ? (
                        <><Loader2 className='h-4 w-4 animate-spin' /> 取消中</>
                      ) : (
                        <><XCircle className='h-4 w-4' /> 取消分享</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm text-(--text-tertiary)'>
                    {shareStatus === 'revoked' ? '该链接已取消，可重新开启' : '开启后可通过 URL 公开访问'}
                  </span>
                  <Button
                    type='button'
                    size='sm'
                    onClick={handleCreateShare}
                    disabled={isLoading || isBusy || pathMessages.length === 0}
                  >
                    {shareActionLoading === 'create' ? (
                      <><Loader2 className='h-4 w-4 animate-spin' /> 处理中</>
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
                    onClick={() => setSelectedIds(new Set(pathMessages.map((p) => p.id)))}
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
                      onClick={() => setSelectedIds(new Set())}
                      className='text-(--text-tertiary) hover:text-(--text-primary)'
                    >
                      清除
                    </Button>
                  )}
                </div>
                <span className='text-xs text-(--text-tertiary)'>已选 {selectedCount} 则</span>
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
                      return (
                        <button
                          key={id}
                          type='button'
                          onClick={() => toggleSelection(id)}
                          className={cn(
                            'flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-2 px-4 py-3.5 text-left transition-colors',
                            isSelected
                              ? 'border-l-(--interactive-primary) bg-(--surface-muted)/50'
                              : 'border-l-transparent hover:bg-(--surface-hover)'
                          )}
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2 text-xs text-(--text-tertiary)'>
                              <span className={message.role === 'user' ? 'font-medium text-(--text-secondary)' : ''}>
                                {ROLE_LABEL[message.role]}
                              </span>
                              <span>·</span>
                              <span>#{pathIndex + 1}</span>
                            </div>
                            <p className='mt-1 line-clamp-2 text-sm text-(--text-secondary)'>
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
        ) : (
          <div className='space-y-5'>
            <div className='max-h-[58vh] overflow-auto rounded-xl bg-(--surface-muted)/20 py-6 px-6'>
              {isGenerating ? (
                <div className='flex min-h-64 flex-col items-center justify-center gap-3 text-(--text-tertiary)'>
                  <Loader2 className='h-6 w-6 animate-spin' /> <span className='text-sm'>正在生成</span>
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
              <Button type='button' variant='ghost' onClick={() => handleOpenChange(false)} className='text-(--text-secondary)'>
                取消
              </Button>
              <Button
                type='button'
                onClick={generatePreview}
                disabled={selectedCount === 0 || isGenerating || isBusy}
                className='min-w-24'
              >
                {isGenerating ? <><Loader2 className='h-4 w-4 animate-spin' /> 生成中</> : '生成预览'}
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
                disabled={isGenerating || isBusy}
                className='text-(--text-secondary)'
              >
                {isGenerating ? <><Loader2 className='h-4 w-4 animate-spin' /> 生成中</> : '重新生成'}
              </Button>
              <Button
                type='button'
                onClick={handleDownload}
                disabled={!previewDataUrl || isGenerating}
                className='min-w-28'
              >
                <Download className='h-4 w-4' /> 下载
              </Button>
            </>
          )}
        </DialogFooter>

        <div aria-hidden className='pointer-events-none fixed -left-3000 top-0 opacity-100'>
          <div
            ref={captureRef}
            className='rounded-2xl border border-border bg-background p-10 text-foreground'
            style={{ width: 960, fontFamily: EXPORT_FONT }}
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
