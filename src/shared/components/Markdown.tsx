import { lazy, memo, Suspense, type FC } from 'react'

type Props = {
  content: string
}

const MarkdownContent: FC<Props> = import.meta.env.SSR
  ? () => null
  : lazy(() => import('./MarkdownContent'))

const Markdown = memo(function Markdown({ content }: Props) {
  if (import.meta.env.SSR) return null
  return (
    <Suspense fallback={null}>
      <MarkdownContent content={content} />
    </Suspense>
  )
})

export default Markdown
