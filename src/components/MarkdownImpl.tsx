import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { createCodePlugin } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'

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
  return (
    <Streamdown
      plugins={plugins}
      isAnimating={isAnimating}
    >
      {content}
    </Streamdown>
  )
})

export default MarkdownImpl
