import { createMemo, For, Loading } from 'solid-js';
import type { TokensResult } from '@shikijs/core';
import { bundledLanguages, codeToTokens } from '@/frontend/design-system/shiki-bundle';

const lineClass =
  'block before:content-[counter(line)] before:inline-block before:[counter-increment:line] before:w-6 before:mr-4 before:text-[13px] before:text-right before:text-muted-foreground/50 before:font-mono before:select-none';

const tokenClass =
  'text-(--markdown-light,inherit) dark:text-(--shiki-dark,var(--markdown-light,inherit)) bg-(--markdown-token-bg,transparent) dark:bg-(--shiki-dark-bg,var(--markdown-token-bg,transparent))';

const highlightCache = new Map<string, TokensResult>();

export function HighlightedCode(props: { code: string; isCompleted: boolean; language: string }) {
  const highlightKey = () => `${props.language}\0${props.code}`;
  const canHighlight = () => !props.language || props.language in bundledLanguages;

  const result = createMemo(async (): Promise<TokensResult | undefined> => {
    const key = highlightKey();
    const cached = highlightCache.get(key);
    if (cached) return cached;
    if (!canHighlight() || !props.isCompleted) return undefined;

    try {
      const tokens = await codeToTokens(props.code, {
        lang: props.language || 'text',
        themes: { light: 'github-light', dark: 'github-dark' },
      });
      highlightCache.set(key, tokens);
      return tokens;
    } catch (error) {
      console.error(`Failed to highlight ${props.language || 'plain text'} code:`, error);
      return undefined;
    }
  });

  const containerStyle = () => {
    const style: Record<string, string> = {};
    if (result()?.bg) style['--markdown-code-bg'] = result()?.bg ?? '';
    if (result()?.fg) style['--markdown-code-text'] = result()?.fg ?? '';
    return style;
  };

  const plainPre = () => (
    <pre data-markdown='code-block-body'>
      <code>{props.code}</code>
    </pre>
  );

  return (
    <Loading fallback={plainPre()}>
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
        plainPre()
      )}
    </Loading>
  );
}
