import { lazy, Suspense } from 'react'

type Props = {
  content: string
  isAnimating?: boolean
}

const MarkdownLazy = import.meta.env.SSR
  ? null
  : lazy(() => import('./MarkdownImpl'))

function Markdown({ content, isAnimating = false }: Props) {
  if (!MarkdownLazy) return null

  return (
    <Suspense fallback={null}>
      <MarkdownLazy content={content} isAnimating={isAnimating} />
    </Suspense>
  )
}

export default Markdown
