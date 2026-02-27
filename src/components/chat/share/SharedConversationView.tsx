import { AlertCircle } from 'lucide-react'
import Markdown from '@/components/Markdown'
import { ResearchBlock } from '@/components/chat/research/ResearchBlock'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/message'

type ShareRenderableAttachment = {
  id: string
  name: string
  url: string
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

type SharedConversationViewProps = {
  messages: ShareRenderableMessage[]
  className?: string
}

export function SharedConversationView({ messages, className }: SharedConversationViewProps) {
  return (
    <section className={cn('space-y-5', className)}>
      {messages.map((message, messageIndex) => (
        <article
          key={message.id}
          className={cn(
            'rounded-xl p-4',
            message.role === 'user'
              ? 'border border-border bg-(--surface-secondary) ml-auto max-w-[60%] w-full text-left'
              : ''
          )}
        >
          <div className='space-y-3'>
            {message.blocks.map((block, blockIndex) => {
              if (block.type === 'content') {
                return (
                  <div
                    key={`${message.id}-content-${blockIndex}`}
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
                    key={`${message.id}-research-${blockIndex}`}
                    items={block.items}
                    blockIndex={blockIndex}
                    messageIndex={messageIndex}
                  />
                )
              }

              if (block.type === 'error') {
                return (
                  <div
                    key={`${message.id}-error-${blockIndex}`}
                    className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-base text-destructive'
                  >
                    <AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
                    <div className='whitespace-pre-wrap'>
                      {block.message}
                    </div>
                  </div>
                )
              }

              if (block.attachments.length === 0) {
                return null
              }

              return (
                <div
                  key={`${message.id}-attachments-${blockIndex}`}
                  className='grid grid-cols-3 gap-3'
                >
                  {block.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className='overflow-hidden rounded-lg border border-border bg-background'
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className='h-28 w-full object-cover'
                      />
                      <div className='px-2 py-1.5 text-xs text-muted-foreground truncate'>
                        {attachment.name}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </article>
      ))}
    </section>
  )
}
