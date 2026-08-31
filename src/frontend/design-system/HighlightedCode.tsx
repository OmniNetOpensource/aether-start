import { useEffect, useState, type CSSProperties } from 'react';
import type { TokensResult } from '@shikijs/core';
import { bundledLanguages, codeToTokens } from '@/frontend/design-system/shiki-bundle';

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

const tokenClass =
  'text-(--markdown-light,inherit) dark:text-(--shiki-dark,var(--markdown-light,inherit)) bg-(--markdown-token-bg,transparent) dark:bg-(--shiki-dark-bg,var(--markdown-token-bg,transparent))';

const highlightCache = new Map<string, TokensResult>();

type HighlightResult = {
  key: string;
  tokens: TokensResult;
};

type HighlightStyle = CSSProperties & {
  '--markdown-code-bg'?: string;
  '--markdown-code-text'?: string;
  '--markdown-light'?: string;
  '--markdown-token-bg'?: string;
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
  const [highlight, setHighlight] = useState<HighlightResult>();
  const cached = highlightCache.get(highlightKey);
  const result = cached ?? (highlight?.key === highlightKey ? highlight.tokens : undefined);

  useEffect(() => {
    if (!isCompleted || (language && !(language in bundledLanguages)) || cached) return;

    let active = true;
    void codeToTokens(code, {
      lang: language || 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
    }).then(
      (tokens) => {
        highlightCache.set(highlightKey, tokens);
        if (active) setHighlight({ key: highlightKey, tokens });
      },
      (error) => {
        console.error(`Failed to highlight ${language || 'plain text'} code:`, error);
      },
    );

    return () => {
      active = false;
    };
  }, [cached, code, highlightKey, isCompleted, language]);

  if (!result) {
    return (
      <pre data-markdown='code-block-body'>
        <code>{code}</code>
      </pre>
    );
  }

  const containerStyle: HighlightStyle = {};
  if (result.bg) containerStyle['--markdown-code-bg'] = result.bg;
  if (result.fg) containerStyle['--markdown-code-text'] = result.fg;

  return (
    <pre data-markdown='code-block-body' style={containerStyle}>
      <code className='[counter-increment:line_0] [counter-reset:line]'>
        {result.tokens.map((line, lineIndex) => (
          <span className={lineClass} key={lineIndex}>
            {line.map((token, tokenIndex) => {
              const style: HighlightStyle = {};
              if (token.color) style['--markdown-light'] = token.color;
              if (token.bgColor) style['--markdown-token-bg'] = token.bgColor;

              for (const [name, value] of Object.entries(token.htmlStyle ?? {})) {
                if (name === 'color') style['--markdown-light'] = value;
                else if (name === 'background-color') style['--markdown-token-bg'] = value;
                else Object.assign(style, { [name]: value });
              }

              return (
                <span
                  {...token.htmlAttrs}
                  className={tokenClass}
                  key={`${tokenIndex}-${token.content}`}
                  style={style}
                >
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
