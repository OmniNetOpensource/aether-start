import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { createCodePlugin } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'

function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.trim().split('\n')
  const paragraphs: string[] = []
  let current: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      current.push(line)
    } else if (!inCodeBlock && line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join('\n'))
        current = []
      }
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join('\n'))
  }

  return paragraphs
}

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
