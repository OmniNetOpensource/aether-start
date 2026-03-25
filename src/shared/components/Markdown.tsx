import { lazy, Suspense } from 'react';

type Props = {
  content: string;
  isAnimating?: boolean;
};

const MarkdownLazy = import.meta.env.SSR ? null : lazy(() => import('./MarkdownImpl'));

const richMarkdownPattern =
  /```|~~~|`[^`]+`|\*\*|__|(^|\n)\s{0,3}#{1,6}\s|!\[|\[[^\]]+\]\([^)]+\)|(^|\n)\s{0,3}>\s|(^|\n)\s{0,3}([-*+]|\d+\.)\s|(^|\n)\|.+\||\$\$|\\\(|\\\[|<\/?[a-z][\w-]*[\s>]/i;

function Markdown({ content, isAnimating = false }: Props) {
  if (!richMarkdownPattern.test(content)) {
    return <div className='whitespace-pre-wrap'>{content}</div>;
  }

  if (!MarkdownLazy) {
    return <div className='whitespace-pre-wrap'>{content}</div>;
  }

  return (
    <Suspense fallback={<div className='whitespace-pre-wrap'>{content}</div>}>
      <MarkdownLazy content={content} isAnimating={isAnimating} />
    </Suspense>
  );
}

export default Markdown;
