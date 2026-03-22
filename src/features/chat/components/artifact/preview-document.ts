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
    }
  </style>
  <div id="error-overlay"><div id="error-card"></div></div>
  <script>
    window.addEventListener('error', (e) => {
      const overlay = document.getElementById('error-overlay');
      const card = document.getElementById('error-card');
      card.textContent = e.message || 'Preview failed';
      overlay.classList.add('visible');
    });
  </script>
`;

function buildReactDocument(code: string): string {
  // Escape the code for safe embedding in a JS template literal
  const escaped = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>${SHARED_STYLES}
      #root { height: 100vh; width: 100%; overflow: auto; }
    </style>
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

        const _module = { exports: {} };
        const _exports = _module.exports;
        const factory = new Function(
          'React', 'exports', 'module',
          'useState', 'useEffect', 'useLayoutEffect', 'useMemo',
          'useRef', 'useReducer', 'useId', 'useDeferredValue',
          'startTransition', 'Fragment',
          compiled + '; return module.exports.default ?? exports.default;',
        );

        const Component = factory(
          React, _exports, _module,
          React.useState, React.useEffect, React.useLayoutEffect, React.useMemo,
          React.useRef, React.useReducer, React.useId, React.useDeferredValue,
          React.startTransition, React.Fragment,
        );

        if (!Component) throw new Error('Artifact must export a default React component');

        createRoot(document.getElementById('root')).render(React.createElement(Component));
      } catch (error) {
        const overlay = document.getElementById('error-overlay');
        const card = document.getElementById('error-card');
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
