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

  if (!/\bexport\s+default\b/.test(code)) {
    throw new Error('React artifacts must export a default component');
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
  const { title, language } = parseRenderArgs(args);
  return `Artifact rendered successfully: "${title}" (${language})`;
};

const renderSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'render',
    description:
      'Create a conversation artifact preview for HTML or React code. Use this when the user asks for a component, page, demo, or visual code output. Tailwind is not available; use inline styles or plain CSS.',
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
            "Artifact language. Use 'react' only for a self-contained TSX component with a default export and no imports.",
        },
        code: {
          type: 'string',
          description:
            'Artifact source code. For React this must be a self-contained TSX component. Use inline styles or plain CSS; Tailwind classes are not supported.',
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
