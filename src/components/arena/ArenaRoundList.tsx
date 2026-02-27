import Markdown from '@/components/Markdown'
import { ImagePreview } from '@/components/ImagePreview'
import { Button } from '@/components/ui/button'
import type { ArenaRoundView, ArenaVoteChoice } from '@/types/arena'
import type { AssistantContentBlock, UserContentBlock } from '@/types/message'

type ArenaRoundListProps = {
  rounds: ArenaRoundView[]
  votingRoundId: string | null
  onVote: (roundId: string, choice: ArenaVoteChoice) => void
}

const voteLabelMap: Record<ArenaVoteChoice, string> = {
  a: '选择 A',
  b: '选择 B',
  tie: '平局',
  both_bad: '都差',
}

const renderUserBlock = (block: UserContentBlock, key: string) => {
  if (block.type === 'content') {
    return (
      <div key={key} className='text-sm leading-relaxed text-(--text-primary)'>
        <Markdown content={block.content} />
      </div>
    )
  }

  return (
    <div key={key} className='flex gap-3 overflow-x-auto'>
      {block.attachments.map((attachment) => (
        <ImagePreview
          key={attachment.id}
          url={attachment.url}
          name={attachment.name}
          size={attachment.size}
          className='shrink-0'
        />
      ))}
    </div>
  )
}

const renderResearchContent = (block: Extract<AssistantContentBlock, { type: 'research' }>) => {
  return (
    <div className='space-y-2 rounded-lg border border-border/40 bg-(--surface-muted)/30 px-3 py-2 text-xs text-(--text-secondary)'>
      {block.items.map((item, itemIndex) => {
        if (item.kind === 'thinking') {
          return (
            <p key={itemIndex} className='whitespace-pre-wrap'>
              {item.text}
            </p>
          )
        }

        return (
          <div key={itemIndex} className='space-y-1'>
            <p className='font-medium text-(--text-primary)'>
              工具: {item.data.call.tool}
            </p>
            {item.data.result ? (
              <pre className='overflow-x-auto whitespace-pre-wrap text-[11px]'>
                {item.data.result.result}
              </pre>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

const renderAssistantBlock = (block: AssistantContentBlock, key: string) => {
  if (block.type === 'content') {
    return (
      <div key={key} className='text-sm leading-relaxed text-(--text-secondary)'>
        <Markdown content={block.content} />
      </div>
    )
  }

  if (block.type === 'error') {
    return (
      <div
        key={key}
        className='rounded-lg border border-destructive/30 bg-(--status-destructive)/10 px-3 py-2 text-sm text-destructive'
      >
        {block.message}
      </div>
    )
  }

  return <div key={key}>{renderResearchContent(block)}</div>
}

const VoteResultBadge = ({ vote }: { vote: ArenaVoteChoice }) => (
  <div className='inline-flex items-center rounded-full border border-border/60 bg-(--surface-muted)/60 px-3 py-1 text-xs text-(--text-secondary)'>
    已投票: {voteLabelMap[vote]}
  </div>
)

export function ArenaRoundList({ rounds, votingRoundId, onVote }: ArenaRoundListProps) {
  if (rounds.length === 0) {
    return (
      <div className='flex flex-1 items-center justify-center px-6 text-sm text-(--text-tertiary)'>
        发送第一条消息，开始 Arena 对战
      </div>
    )
  }

  return (
    <div className='mx-auto flex w-[90%] flex-col gap-8 pb-48 pt-6 md:w-[78%] lg:w-[70%]'>
      {rounds.map((round) => {
        const roundVoting = votingRoundId === round.id
        return (
          <section key={round.id} className='space-y-4 rounded-2xl border border-border/40 bg-(--surface-primary) p-4'>
            <div className='space-y-2'>
              <p className='text-xs font-medium uppercase tracking-wider text-(--text-tertiary)'>Prompt</p>
              <div className='space-y-3'>
                {round.prompt.map((block, blockIndex) => renderUserBlock(block, `${round.id}-prompt-${blockIndex}`))}
              </div>
            </div>

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              <article className='space-y-2 rounded-xl border border-border/40 bg-background p-3'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs font-semibold uppercase tracking-wide text-(--text-tertiary)'>
                    Response A
                  </p>
                  <p className='text-xs text-(--text-tertiary)'>
                    {round.responseA.model ? round.responseA.model.name : '模型隐藏'}
                  </p>
                </div>
                <div className='space-y-3'>
                  {round.responseA.blocks.map((block, blockIndex) =>
                    renderAssistantBlock(block, `${round.id}-a-${blockIndex}`),
                  )}
                </div>
              </article>

              <article className='space-y-2 rounded-xl border border-border/40 bg-background p-3'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs font-semibold uppercase tracking-wide text-(--text-tertiary)'>
                    Response B
                  </p>
                  <p className='text-xs text-(--text-tertiary)'>
                    {round.responseB.model ? round.responseB.model.name : '模型隐藏'}
                  </p>
                </div>
                <div className='space-y-3'>
                  {round.responseB.blocks.map((block, blockIndex) =>
                    renderAssistantBlock(block, `${round.id}-b-${blockIndex}`),
                  )}
                </div>
              </article>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              {round.vote ? (
                <VoteResultBadge vote={round.vote} />
              ) : (
                <>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onVote(round.id, 'a')}
                    disabled={roundVoting}
                  >
                    A 更好
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onVote(round.id, 'b')}
                    disabled={roundVoting}
                  >
                    B 更好
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onVote(round.id, 'tie')}
                    disabled={roundVoting}
                  >
                    平局
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => onVote(round.id, 'both_bad')}
                    disabled={roundVoting}
                  >
                    都差
                  </Button>
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
