import { useEffect, useState } from 'react';
import type { CodeHighlighterPlugin } from 'streamdown';

const lang = 'html';

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

const tokenClass =
  'text-(--sdm-c,inherit) dark:text-(--shiki-dark,var(--sdm-c,inherit)) bg-(--sdm-tbg,transparent) dark:bg-(--shiki-dark-bg,var(--sdm-tbg,transparent))';

type HighlightResult = {
  bg?: string;
  fg?: string;
  tokens: {
    content: string;
    color?: string;
    bgColor?: string;
    htmlStyle?: Record<string, string>;
    htmlAttrs?: Record<string, string>;
  }[][];
};

const highlightCache = new Map<string, HighlightResult>();
let codePluginPromise: Promise<CodeHighlighterPlugin> | null = null;

const loadCodePlugin = () => {
  if (!codePluginPromise) {
    codePluginPromise = import('@streamdown/code').then(({ createCodePlugin }) =>
      createCodePlugin({ themes: ['github-light', 'github-dark'] }),
    );
  }
  return codePluginPromise;
};

export function ArtifactCodeBlock({ code, isCompleted }: { code: string; isCompleted: boolean }) {
  const [highlight, setHighlight] = useState<HighlightResult | null>(
    () => highlightCache.get(code) ?? null,
  );

  useEffect(() => {
    if (!isCompleted || highlightCache.has(code)) return;

    let cancelled = false;

    void loadCodePlugin().then((plugin) => {
      if (cancelled) return;

      const apply = (result: HighlightResult) => {
        highlightCache.set(code, result);
        if (!cancelled) setHighlight(result);
      };

      const result = plugin.highlight({ code, language: lang, themes: plugin.getThemes() }, apply);
      if (result) apply(result);
    });

    return () => {
      cancelled = true;
    };
  }, [code, isCompleted]);

  if (!highlight) {
    return (
      <pre className='m-0 whitespace-pre-wrap wrap-break-word rounded-md bg-(--surface-muted) p-0 text-foreground'>
        <code>{code}</code>
      </pre>
    );
  }

  const containerStyle: Record<string, string> = {};
  if (highlight.bg) containerStyle['--sdm-bg'] = highlight.bg;
  if (highlight.fg) containerStyle['--sdm-fg'] = highlight.fg;

  return (
    <div
      className='m-0'
      data-streamdown='code-block-body'
      data-language={lang}
      style={containerStyle}
    >
      <pre className='m-0 bg-(--sdm-bg,inherit) dark:bg-(--shiki-dark-bg,var(--sdm-bg,inherit))'>
        <code className='[counter-increment:line_0] [counter-reset:line]'>
          {highlight.tokens.map((line, lineIdx) => (
            <span key={lineIdx} className={lineClass}>
              {line.map((token, tokenIdx) => {
                const style: Record<string, string> = {};
                if (token.color) style['--sdm-c'] = token.color;
                if (token.bgColor) style['--sdm-tbg'] = token.bgColor;
                for (const [key, value] of Object.entries(token.htmlStyle ?? {})) {
                  if (key === 'color') style['--sdm-c'] = value;
                  else if (key === 'background-color') style['--sdm-tbg'] = value;
                  else style[key] = value;
                }
                return (
                  <span key={tokenIdx} className={tokenClass} style={style} {...token.htmlAttrs}>
                    {token.content}
                  </span>
                );
              })}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
