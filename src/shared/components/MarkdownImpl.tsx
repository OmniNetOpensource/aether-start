import { memo, useEffect, useRef } from 'react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';
import 'katex/dist/katex.min.css';

function splitMarkdownParagraphs(text: string): string[] {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      current.push(line);
    } else if (!inCodeBlock && line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join('\n'));
  }

  return paragraphs;
}

type Props = {
  content: string;
  isAnimating?: boolean;
};

const codePlugin = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});

const plugins = { code: codePlugin, math, cjk };

type StreamdownBlockProps = {
  markdown: string;
  blockIsAnimating: boolean;
};

const StreamdownBlock = memo(function StreamdownBlock({
  markdown,
  blockIsAnimating,
}: StreamdownBlockProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    if (blockIsAnimating) {
      el.style.contentVisibility = '';
      el.style.containIntrinsicBlockSize = '';
      return;
    }

    const h = Math.round(el.getBoundingClientRect().height);
    if (h > 0) {
      el.style.contentVisibility = 'auto';
      el.style.containIntrinsicBlockSize = `${h}px`;
    } else {
      el.style.contentVisibility = '';
      el.style.containIntrinsicBlockSize = '';
    }
  }, [blockIsAnimating]);

  return (
    <div ref={wrapRef}>
      <Streamdown
        plugins={plugins}
        rehypePlugins={[defaultRehypePlugins.sanitize, defaultRehypePlugins.harden]}
        isAnimating={blockIsAnimating}
      >
        {markdown}
      </Streamdown>
    </div>
  );
});

function MarkdownImpl({ content, isAnimating = false }: Props) {
  const paragraphs = splitMarkdownParagraphs(content);

  return (
    <div className='space-y-3 [&_b]:font-extrabold [&_strong]:font-extrabold'>
      {paragraphs.map((paragraph, i) => (
        <StreamdownBlock
          key={i}
          markdown={paragraph}
          blockIsAnimating={isAnimating && i === paragraphs.length - 1}
        />
      ))}
    </div>
  );
}

export default MarkdownImpl;
