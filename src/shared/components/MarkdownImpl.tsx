import { memo, useEffect, useRef } from 'react';
import { createCodePlugin } from '@streamdown/code';
import { Streamdown, defaultRehypePlugins, type PluginConfig } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import 'streamdown/styles.css';
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

const plugins: PluginConfig = {
  cjk,
  code: createCodePlugin({
    themes: ['github-light', 'github-dark'],
  }),
  math: createMathPlugin({ singleDollarTextMath: true }),
};

type StreamdownBlockProps = {
  markdown: string;
  blockIsAnimating: boolean;
  plugins: PluginConfig;
};

const StreamdownBlock = memo(function StreamdownBlock({
  markdown,
  blockIsAnimating,
  plugins,
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
          plugins={plugins}
        />
      ))}
    </div>
  );
}

export default MarkdownImpl;
