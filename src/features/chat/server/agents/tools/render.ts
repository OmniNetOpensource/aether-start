import type { ArtifactLanguage } from '@/types/chat-api';
import type { ChatTool, ToolDefinition, ToolHandler } from './types';

const TITLE_MAX_LENGTH = 120;
const CODE_MAX_LENGTH = 200_000;

export type RenderArgs = {
  title: string;
  language: ArtifactLanguage;
  code: string;
};

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const parseReactCode = (code: string) => {
  if (/\bimport\s+/.test(code)) {
    throw new Error('React artifacts must be self-contained and cannot use import statements');
  }

  if (!/\bexport\s+default\s+function\s+App\b/.test(code)) {
    throw new Error(
      'React artifacts must use exactly `export default function App` (component name must be App, not another name)',
    );
  }
};

export const parseRenderArgs = (args: unknown): RenderArgs => {
  if (!args || typeof args !== 'object') {
    throw new Error('render requires an object payload');
  }

  const title = normalizeString((args as { title?: unknown }).title);
  if (!title) {
    throw new Error('render requires a non-empty title');
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error(`render title must be ${TITLE_MAX_LENGTH} characters or fewer`);
  }

  const language = (args as { language?: unknown }).language;
  if (language !== 'html' && language !== 'react') {
    throw new Error("render language must be 'html' or 'react'");
  }

  const code =
    typeof (args as { code?: unknown }).code === 'string'
      ? (args as { code: string }).code.trim()
      : '';
  if (!code) {
    throw new Error('render requires non-empty code');
  }
  if (code.length > CODE_MAX_LENGTH) {
    throw new Error(`render code must be ${CODE_MAX_LENGTH} characters or fewer`);
  }

  if (language === 'react') {
    parseReactCode(code);
  }

  return {
    title,
    language,
    code,
  };
};

const renderArtifact: ToolHandler = async (args) => {
  try {
    const { title, language } = parseRenderArgs(args);
    return `Artifact rendered successfully: "${title}" (${language})`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const renderSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'render',
    description:
      'Create a conversation artifact preview for HTML or React code. Use this when the user asks for a component, page, demo, or visual code output. Tailwind is not available; use inline styles or plain CSS. For React: the entry component must be `export default function App`; do NOT write any import statements — React hooks (useState, useEffect, useRef, etc.) and APIs (createContext, memo, forwardRef, etc.) are pre-injected as globals.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: {
          type: 'string',
          description: 'Short artifact title, 120 characters or fewer',
        },
        language: {
          type: 'string',
          enum: ['html', 'react'],
          description:
            "Artifact language. Use 'react' for TSX: no imports needed (React hooks and APIs are globals), root component must be `export default function App`.",
        },
        code: {
          type: 'string',
          description:
            'Artifact source code. For React: TSX with `export default function App`, no imports (hooks like useState/useEffect and APIs like createContext/memo are pre-injected globals); inline styles or plain CSS only (no Tailwind).',
        },
      },
      required: ['title', 'language', 'code'],
    },
  },
};

export const renderTool: ToolDefinition = {
  spec: renderSpec,
  handler: renderArtifact,
};
