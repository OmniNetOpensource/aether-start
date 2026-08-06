import { createEffect, createMemo, createSignal, For } from 'solid-js';
import type { TokensResult } from '@shikijs/core';
import { bundledLanguages, codeToTokens } from '@/frontend/design-system/shiki-bundle';

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

const tokenClass =
  'text-(--markdown-light,inherit) dark:text-(--shiki-dark,var(--markdown-light,inherit)) bg-(--markdown-token-bg,transparent) dark:bg-(--shiki-dark-bg,var(--markdown-token-bg,transparent))';

const highlightCache = new Map<string, TokensResult>();

type Highlight = {
  key: string;
  result: TokensResult;
};

export function HighlightedCode(props: { code: string; isCompleted: boolean; language: string }) {
  const highlightKey = () => `${props.language}\0${props.code}`;
  const canHighlight = () => !props.language || props.language in bundledLanguages;
  const [highlight, setHighlight] = createSignal<Highlight | null>(null);
  const result = createMemo(() => {
    const current = highlight();
    return current?.key === highlightKey() ? current.result : highlightCache.get(highlightKey());
  });
  let request = 0;

  createEffect(
    () => ({
      code: props.code,
      isCompleted: props.isCompleted,
      language: props.language,
      canHighlight: canHighlight(),
      highlightKey: highlightKey(),
    }),
    ({
      code: currentCode,
      isCompleted: completed,
      language: currentLanguage,
      canHighlight: available,
      highlightKey: key,
    }) => {
      if (!available || !completed || highlightCache.has(key)) return;
      const currentRequest = ++request;

      void codeToTokens(currentCode, {
        lang: currentLanguage || 'text',
        themes: { light: 'github-light', dark: 'github-dark' },
      }).then(
        (nextResult) => {
          highlightCache.set(key, nextResult);
          if (currentRequest === request) setHighlight({ key, result: nextResult });
        },
        (error) => {
          console.error(`Failed to highlight ${currentLanguage || 'plain text'} code:`, error);
        },
      );
    },
  );

  const containerStyle = () => {
    const style: Record<string, string> = {};
    if (result()?.bg) style['--markdown-code-bg'] = result()?.bg ?? '';
    if (result()?.fg) style['--markdown-code-text'] = result()?.fg ?? '';
    return style;
  };

  return (
    <>
      {result() ? (
        <pre data-markdown='code-block-body' style={containerStyle()}>
          <code class='[counter-increment:line_0] [counter-reset:line]'>
            <For each={result()?.tokens ?? []}>
              {(line) => (
                <span class={lineClass}>
                  <For each={line}>
                    {(token) => {
                      const style: Record<string, string> = {};
                      if (token.color) style['--markdown-light'] = token.color;
                      if (token.bgColor) style['--markdown-token-bg'] = token.bgColor;

                      for (const [name, value] of Object.entries(token.htmlStyle ?? {})) {
                        if (name === 'color') style['--markdown-light'] = value;
                        else if (name === 'background-color') style['--markdown-token-bg'] = value;
                        else style[name] = value;
                      }

                      return (
                        <span class={tokenClass} style={style} {...token.htmlAttrs}>
                          {token.content}
                        </span>
                      );
                    }}
                  </For>
                </span>
              )}
            </For>
          </code>
        </pre>
      ) : (
        <pre data-markdown='code-block-body'>
          <code>{props.code}</code>
        </pre>
      )}
    </>
  );
}
