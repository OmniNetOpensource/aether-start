import type { ArtifactLanguage } from '@/types/chat-api';

const SUCRASE_CDN = 'https://esm.sh/sucrase@3.35.0';
const REACT_CDN = 'https://esm.sh/react@19.2.4';
const REACT_DOM_CDN = 'https://esm.sh/react-dom@19.2.4/client';

const SHARED_STYLES = `
  :root {
    color-scheme: light;
    font-family: "SF Pro Text", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
    background: #ffffff;
    color: #111827;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; width: 100%; background: #ffffff; }
  body { position: relative; overflow: auto; }
  #root { height: 100vh; width: 100%; overflow: auto; }
`;

const ERROR_OVERLAY = `
  <style>
    #error-overlay {
      display: none;
      position: fixed;
      inset: 0;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      font-size: 14px;
      line-height: 1.5;
      background: rgba(255, 255, 255, 0.92);
    }
    #error-overlay.visible { display: flex; }
    #error-card {
      max-width: 720px;
      border-radius: 20px;
      border: 1px solid rgba(220, 38, 38, 0.2);
      padding: 16px 18px;
      background: rgba(254, 242, 242, 0.96);
      color: #b91c1c;
      white-space: pre-wrap;
    }
  </style>
  <div id="error-overlay"><div id="error-card"></div></div>
  <script>
    window.addEventListener('error', (event) => {
      const overlay = document.getElementById('error-overlay');
      const card = document.getElementById('error-card');
      if (!overlay || !card) return;
      card.textContent = event.message || 'Preview failed';
      overlay.classList.add('visible');
    });
  </script>
`;

function buildReactDocument(code: string): string {
  const escaped = code
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>${SHARED_STYLES}</style>
  </head>
  <body>
    <div id="root"></div>
    ${ERROR_OVERLAY}
    <script type="module">
      import * as React from '${REACT_CDN}';
      import { createRoot } from '${REACT_DOM_CDN}';
      import { transform } from '${SUCRASE_CDN}';

      try {
        const code = \`${escaped}\`;
        const { code: compiled } = transform(code, {
          transforms: ['jsx', 'typescript', 'imports'],
          production: true,
        });

        if (!compiled) throw new Error('Failed to compile artifact code');

        const root = document.getElementById('root');
        if (!root) throw new Error('Preview root not found');

        const module = { exports: {} };
        const exports = module.exports;
        const reactGlobals = {
          createContext: React.createContext,
          createElement: React.createElement,
          forwardRef: React.forwardRef,
          Fragment: React.Fragment,
          lazy: React.lazy,
          memo: React.memo,
          startTransition: React.startTransition,
          Suspense: React.Suspense,
          use: React.use,
          useActionState: React.useActionState,
          useCallback: React.useCallback,
          useContext: React.useContext,
          useDebugValue: React.useDebugValue,
          useDeferredValue: React.useDeferredValue,
          useEffect: React.useEffect,
          useId: React.useId,
          useImperativeHandle: React.useImperativeHandle,
          useInsertionEffect: React.useInsertionEffect,
          useLayoutEffect: React.useLayoutEffect,
          useMemo: React.useMemo,
          useOptimistic: React.useOptimistic,
          useReducer: React.useReducer,
          useRef: React.useRef,
          useState: React.useState,
          useSyncExternalStore: React.useSyncExternalStore,
          useTransition: React.useTransition,
        };

        const factory = new Function(
          'React',
          'exports',
          'module',
          ...Object.keys(reactGlobals),
          compiled + '; return module.exports.default ?? exports.default;',
        );

        const Component = factory(
          React,
          exports,
          module,
          ...Object.values(reactGlobals),
        );

        if (!Component) {
          throw new Error('Artifact must export a default React component');
        }

        createRoot(root).render(React.createElement(Component));
      } catch (error) {
        const overlay = document.getElementById('error-overlay');
        const card = document.getElementById('error-card');
        if (!overlay || !card) throw error;
        card.textContent = error instanceof Error ? error.message : String(error);
        overlay.classList.add('visible');
      }
    </script>
  </body>
</html>`;
}

export function buildPreviewDocument(language: ArtifactLanguage, code: string): string {
  if (language === 'html') return code;
  return buildReactDocument(code);
}
