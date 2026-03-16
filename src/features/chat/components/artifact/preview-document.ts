import { ARTIFACT_PREVIEW_MESSAGE_TYPE } from "./preview-protocol";

const BABEL_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.1/babel.min.js";
const REACT_CDN_URL = "https://esm.sh/react@19.2.4";
const REACT_DOM_CDN_URL = "https://esm.sh/react-dom@19.2.4/client";

export const ARTIFACT_PREVIEW_DOCUMENT = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <style>
      :root {
        color-scheme: light;
        font-family:
          "SF Pro Text", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
        background: #ffffff;
        color: #111827;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
        width: 100%;
        background: #ffffff;
      }

      body {
        position: relative;
        overflow: auto;
      }

      #mount {
        height: 100vh;
        width: 100%;
        overflow: auto;
      }

      #status {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        font-size: 14px;
        line-height: 1.5;
        color: #6b7280;
        background: rgba(255, 255, 255, 0.92);
      }

      #status[data-kind="ready"] {
        display: none;
      }

      #status[data-kind="error"] {
        align-items: center;
      }

      #status-card {
        max-width: 720px;
        border-radius: 20px;
        border: 1px solid transparent;
        padding: 16px 18px;
        background: transparent;
      }

      #status[data-kind="error"] #status-card {
        border-color: rgba(220, 38, 38, 0.2);
        background: rgba(254, 242, 242, 0.96);
        color: #b91c1c;
      }

      .html-frame {
        display: block;
        height: 100%;
        width: 100%;
        border: 0;
        background: #ffffff;
      }
    </style>
    <script src="${BABEL_CDN_URL}"></script>
  </head>
  <body>
    <div id="mount"></div>
    <div id="status" data-kind="idle">
      <div id="status-card">Waiting for artifact preview...</div>
    </div>
    <script type="module">
      import * as React from '${REACT_CDN_URL}';
      import { createRoot } from '${REACT_DOM_CDN_URL}';

      const messageType = ${JSON.stringify(ARTIFACT_PREVIEW_MESSAGE_TYPE)};
      const mountNode = document.getElementById('mount');
      const statusNode = document.getElementById('status');
      const statusCardNode = document.getElementById('status-card');
      const state = { reactRoot: null };

      const setStatus = (kind, message) => {
        statusNode.dataset.kind = kind;
        statusCardNode.textContent = message;
      };

      const clearMount = () => {
        if (state.reactRoot) {
          state.reactRoot.unmount();
          state.reactRoot = null;
        }

        mountNode.replaceChildren();
      };

      const renderHtml = (code) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.className = 'html-frame';
        frame.srcdoc = code;
        mountNode.replaceChildren(frame);
        setStatus('ready', '');
      };

      const createReactComponent = (code) => {
        const transformed = window.Babel.transform(code, {
          filename: 'artifact.tsx',
          presets: [['react', { runtime: 'classic' }], 'typescript'],
          plugins: ['transform-modules-commonjs'],
        }).code;

        if (!transformed) {
          throw new Error('Failed to compile artifact code');
        }

        const module = { exports: {} };
        const exports = module.exports;
        const factory = new Function(
          'React',
          'exports',
          'module',
          'useState',
          'useEffect',
          'useLayoutEffect',
          'useMemo',
          'useRef',
          'useReducer',
          'useId',
          'useDeferredValue',
          'startTransition',
          'Fragment',
          transformed + '; return module.exports.default ?? exports.default;',
        );

        const component = factory(
          React,
          exports,
          module,
          React.useState,
          React.useEffect,
          React.useLayoutEffect,
          React.useMemo,
          React.useRef,
          React.useReducer,
          React.useId,
          React.useDeferredValue,
          React.startTransition,
          React.Fragment,
        );

        if (!component) {
          throw new Error('Artifact must export a default React component');
        }

        return component;
      };

      const renderReact = async (code) => {
        setStatus('loading', 'Compiling preview...');
        const Component = createReactComponent(code);
        const root = createRoot(mountNode);
        state.reactRoot = root;
        root.render(React.createElement(Component));
        setStatus('ready', '');
      };

      const renderArtifact = async (payload) => {
        try {
          clearMount();

          if (payload.language === 'html') {
            renderHtml(payload.code);
            return;
          }

          await renderReact(payload.code);
        } catch (error) {
          clearMount();
          setStatus(
            'error',
            error instanceof Error ? error.message : String(error),
          );
        }
      };

      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) {
          return;
        }

        const payload = event.data;
        if (!payload || payload.type !== messageType) {
          return;
        }

        void renderArtifact(payload);
      });

      window.addEventListener('error', (event) => {
        setStatus('error', event.message || 'Preview failed');
      });
    </script>
  </body>
</html>`;
