import { memo, useEffect, useRef, useState } from 'react';
import { Streamdown, defaultRehypePlugins, type PluginConfig } from 'streamdown';
import { cjk } from '@streamdown/cjk';
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

const codeFencePattern = /```|~~~/;
const mathPattern = /(^|[^\\])\$\$|(^|[^\\])\$[^$\n]+?\$|\\\(|\\\[/m;

let codePluginPromise: Promise<PluginConfig['code']> | null = null;
let mathPluginPromise: Promise<PluginConfig['math']> | null = null;

const loadCodePlugin = () => {
  if (!codePluginPromise) {
    codePluginPromise = import('@streamdown/code').then(({ createCodePlugin }) =>
      createCodePlugin({
        themes: ['github-light', 'github-dark'],
      }),
    );
  }

  return codePluginPromise;
};

const loadMathPlugin = () => {
  if (!mathPluginPromise) {
    mathPluginPromise = import('@streamdown/math').then(({ createMathPlugin }) =>
      createMathPlugin({ singleDollarTextMath: true }),
    );
  }

  return mathPluginPromise;
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
  const [codePlugin, setCodePlugin] = useState<PluginConfig['code']>();
  const [mathPlugin, setMathPlugin] = useState<PluginConfig['math']>();
  const needsCodePlugin = codeFencePattern.test(content);
  const needsMathPlugin = mathPattern.test(content);
  const paragraphs = splitMarkdownParagraphs(content);
  const plugins: PluginConfig = {
    cjk,
    ...(needsCodePlugin && codePlugin ? { code: codePlugin } : {}),
    ...(needsMathPlugin && mathPlugin ? { math: mathPlugin } : {}),
  };

  useEffect(() => {
    let cancelled = false;

    if (needsCodePlugin && !codePlugin) {
      void loadCodePlugin().then((plugin) => {
        if (!cancelled) {
          setCodePlugin(plugin);
        }
      });
    }

    if (needsMathPlugin && !mathPlugin) {
      void loadMathPlugin().then((plugin) => {
        if (!cancelled) {
          setMathPlugin(plugin);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [codePlugin, mathPlugin, needsCodePlugin, needsMathPlugin]);

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
