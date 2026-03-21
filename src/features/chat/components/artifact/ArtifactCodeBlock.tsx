import { useState } from 'react';
import { createCodePlugin } from '@streamdown/code';
import type { ArtifactLanguage } from '@/types/chat-api';

const codePlugin = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});

const artifactLangToShiki: Record<ArtifactLanguage, 'html' | 'tsx'> = {
  html: 'html',
  react: 'tsx',
};

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

type HighlightToken = {
  content: string;
  color?: string;
  bgColor?: string;
  htmlStyle?: Record<string, string>;
  htmlAttrs?: Record<string, string>;
};

type HighlightResult = {
  bg?: string;
  fg?: string;
  tokens: HighlightToken[][];
};

type Props = {
  code: string;
  language: ArtifactLanguage;
};

export function ArtifactCodeBlock({ code, language }: Props) {
  const [highlight, setHighlight] = useState<HighlightResult | null>(null);

  const shikiLang = artifactLangToShiki[language];

  if (codePlugin.supportsLanguage(shikiLang)) {
    codePlugin.highlight({ code, language: shikiLang, themes: codePlugin.getThemes() }, (res) =>
      setHighlight(res),
    );
  }

  if (!highlight) {
    return (
      <pre className='min-h-0 flex-1 overflow-auto rounded-md bg-(--surface-muted) p-4 text-xs leading-relaxed text-foreground'>
        <code>{code}</code>
      </pre>
    );
  }

  const style: Record<string, string> = {};
  if (highlight.bg) style['--sdm-bg'] = highlight.bg;
  if (highlight.fg) style['--sdm-fg'] = highlight.fg;

  return (
    <div
      className='min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-4 text-xs leading-relaxed'
      data-streamdown='code-block-body'
      data-language={shikiLang}
      style={style}
    >
      <pre className='bg-(--sdm-bg,inherit) dark:bg-(--shiki-dark-bg,var(--sdm-bg,inherit))'>
        <code className='[counter-increment:line_0] [counter-reset:line]'>
          {highlight.tokens.map((line, lineIdx) => (
            <span key={lineIdx} className={lineClass}>
              {line.map((token, tokenIdx) => {
                const tokenStyle: Record<string, string> = {};
                if (token.color) tokenStyle['--sdm-c'] = token.color;
                if (token.bgColor) tokenStyle['--sdm-tbg'] = token.bgColor;
                if (token.htmlStyle) {
                  for (const [k, v] of Object.entries(token.htmlStyle)) {
                    if (k === 'color') tokenStyle['--sdm-c'] = v;
                    else if (k === 'background-color') tokenStyle['--sdm-tbg'] = v;
                    else tokenStyle[k] = v;
                  }
                }
                const hasBg = !!token.bgColor || !!tokenStyle['--sdm-tbg'];
                return (
                  <span
                    key={tokenIdx}
                    className={`text-(--sdm-c,inherit) dark:text-(--shiki-dark,var(--sdm-c,inherit)) ${hasBg ? 'bg-(--sdm-tbg) dark:bg-(--shiki-dark-bg,var(--sdm-tbg))' : ''}`}
                    style={tokenStyle}
                    {...token.htmlAttrs}
                  >
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
