import { lazy, Suspense } from 'react';
import { loadWithRetry } from '@/shared/browser/load-with-retry';

const MarkdownImpl = lazy(() =>
  loadWithRetry(() => import('./MarkdownImpl')),
);

type Props = {
  content: string;
  isAnimating?: boolean;
};

function Markdown({ content, isAnimating = false }: Props) {
  return (
    <div>
      <Suspense fallback={<div className='whitespace-pre-wrap'>{content}</div>}>
        <MarkdownImpl content={content} isAnimating={isAnimating} />
      </Suspense>
    </div>
  );
}

export default Markdown;
