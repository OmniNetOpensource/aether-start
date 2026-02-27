import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { createCodePlugin } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'
import { splitMarkdownParagraphs } from '@/lib/markdown'

type Props = {
  content: string
  isAnimating?: boolean
}

const codePlugin = createCodePlugin({
  themes: ['github-light', 'github-dark'],
})

const plugins = { code: codePlugin, math, cjk }

const MarkdownImpl = memo(function MarkdownImpl({
  content,
  isAnimating = false,
}: Props) {
  const paragraphs = splitMarkdownParagraphs(content)

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, i) => (
        <Streamdown
          key={i}
          plugins={plugins}
          isAnimating={isAnimating && i === paragraphs.length - 1}
        >
          {paragraph}
        </Streamdown>
      ))}
    </div>
  )
})

export default MarkdownImpl
