import { useEffect, useState } from 'react';
import type { TokensResult } from '@shikijs/core';
import { bundledLanguages, codeToTokens } from '@/shared/design-system/shiki-bundle';

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

const tokenClass =
  'text-(--markdown-light,inherit) dark:text-(--shiki-dark,var(--markdown-light,inherit)) bg-(--markdown-token-bg,transparent) dark:bg-(--shiki-dark-bg,var(--markdown-token-bg,transparent))';

const highlightCache = new Map<string, TokensResult>();

type Highlight = {
  key: string;
  result: TokensResult;
};

export function HighlightedCode({
  code,
  isCompleted,
  language,
}: {
  code: string;
  isCompleted: boolean;
  language: string;
}) {
  const highlightKey = `${language}\0${code}`;
  const canHighlight = !language || language in bundledLanguages;
  const [highlight, setHighlight] = useState<Highlight | null>(() => {
    const result = highlightCache.get(highlightKey);
    return result ? { key: highlightKey, result } : null;
  });
  const result =
    highlight?.key === highlightKey ? highlight.result : highlightCache.get(highlightKey);

  useEffect(() => {
    if (!canHighlight || !isCompleted || highlightCache.has(highlightKey)) return;

    let cancelled = false;

    void codeToTokens(code, {
      lang: language || 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
    }).then(
      (nextResult) => {
        highlightCache.set(highlightKey, nextResult);
        if (!cancelled) setHighlight({ key: highlightKey, result: nextResult });
      },
      (error) => {
        console.error(`Failed to highlight ${language || 'plain text'} code:`, error);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [canHighlight, code, highlightKey, isCompleted, language]);

  if (!result) {
    return (
      <pre data-markdown='code-block-body'>
        <code>{code}</code>
      </pre>
    );
  }

  const containerStyle: Record<string, string> = {};
  if (result.bg) containerStyle['--markdown-code-bg'] = result.bg;
  if (result.fg) containerStyle['--markdown-code-text'] = result.fg;

  return (
    <pre data-markdown='code-block-body' style={containerStyle}>
      <code className='[counter-increment:line_0] [counter-reset:line]'>
        {result.tokens.map((line, lineIndex) => (
          <span className={lineClass} key={lineIndex}>
            {line.map((token, tokenIndex) => {
              const style: Record<string, string> = {};
              if (token.color) style['--markdown-light'] = token.color;
              if (token.bgColor) style['--markdown-token-bg'] = token.bgColor;

              for (const [name, value] of Object.entries(token.htmlStyle ?? {})) {
                if (name === 'color') style['--markdown-light'] = value;
                else if (name === 'background-color') style['--markdown-token-bg'] = value;
                else style[name] = value;
              }

              return (
                <span className={tokenClass} key={tokenIndex} style={style} {...token.htmlAttrs}>
                  {token.content}
                </span>
              );
            })}
          </span>
        ))}
      </code>
    </pre>
  );
}
