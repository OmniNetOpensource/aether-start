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

const Markdown = memo(function Markdown({ content, isAnimating = false }: Props) {
  if (import.meta.env.SSR) return null

  return (
    <Streamdown
      plugins={{ code: codePlugin, math, cjk }}
      isAnimating={isAnimating}
    >
      {content}
    </Streamdown>
  )
})

export default Markdown
