import type { ChatTool, ToolDefinition, ToolHandler } from './types';

const TITLE_MAX_LENGTH = 120;
const CODE_MAX_LENGTH = 200_000;

export type RenderArgs = {
  title: string;
  code: string;
};

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

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

  return {
    title,
    code,
  };
};

const renderArtifact: ToolHandler = async (args) => {
  try {
    const { title } = parseRenderArgs(args);
    return `Artifact rendered successfully: "${title}" (html)`;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const renderSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'render',
    description:
      'Create a visual artifact. Output must be a complete, self-contained HTML file that works directly in an iframe — no build step, no local imports. To use React, Vue, Three.js, or any library: load it from a CDN (e.g. https://esm.sh/react@19). Use <script type="module"> for ES modules. Tailwind CSS is available via CDN: <script src="https://cdn.tailwindcss.com"></script>',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: {
          type: 'string',
          description: 'Short artifact title, 120 characters or fewer',
        },
        code: {
          type: 'string',
          description:
            'Complete, self-contained HTML. Must include <!doctype html> and run as-is in an iframe.',
        },
      },
      required: ['title', 'code'],
    },
  },
};

export const renderTool: ToolDefinition = {
  spec: renderSpec,
  handler: renderArtifact,
};
