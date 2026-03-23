import { useEffect, useState } from 'react';
import { createCodePlugin } from '@streamdown/code';
import type { ArtifactLanguage } from '@/types/chat-api';

const codePlugin = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});

const shikiLang: Record<ArtifactLanguage, 'html' | 'tsx'> = {
  html: 'html',
  react: 'tsx',
};

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

function getHighlightCacheKey(code: string, language: ArtifactLanguage) {
  return `${language}:${code}`;
}

export function ArtifactCodeBlock({ code, language }: { code: string; language: ArtifactLanguage }) {
  const lang = shikiLang[language];
  const cacheKey = getHighlightCacheKey(code, language);
  const [highlightState, setHighlightState] = useState(() => ({
    cacheKey,
    result: highlightCache.get(cacheKey) ?? null,
  }));
  const highlight =
    highlightState.cacheKey === cacheKey
      ? highlightState.result
      : highlightCache.get(cacheKey) ?? null;

  useEffect(() => {
    if (!codePlugin.supportsLanguage(lang) || highlightCache.has(cacheKey)) {
      return;
    }

    let cancelled = false;

    const applyHighlight = (nextHighlight: HighlightResult) => {
      highlightCache.set(cacheKey, nextHighlight);

      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setHighlightState({
          cacheKey,
          result: nextHighlight,
        });
      });
    };

    const nextHighlight = codePlugin.highlight(
      { code, language: lang, themes: codePlugin.getThemes() },
      applyHighlight,
    );

    if (nextHighlight) {
      applyHighlight(nextHighlight);
    }

    return () => {
      cancelled = true;
    };
  }, [cacheKey, code, lang]);

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
      <pre className='bg-(--sdm-bg,inherit) dark:bg-(--shiki-dark-bg,var(--sdm-bg,inherit))'>
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
