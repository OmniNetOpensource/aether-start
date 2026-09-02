import type { ChatTool, ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';

const CODE_MAX_LENGTH = 200_000;

export type RenderArgs = {
  code: string;
};

export const parseRenderArgs = (args: unknown): RenderArgs => {
  if (!args || typeof args !== 'object') {
    throw new Error('render requires an object payload');
  }

  const code = 'code' in args && typeof args.code === 'string' ? args.code.trim() : '';
  if (!code) {
    throw new Error('render requires non-empty code');
  }
  if (code.length > CODE_MAX_LENGTH) {
    throw new Error(`render code must be ${CODE_MAX_LENGTH} characters or fewer`);
  }

  return {
    code,
  };
};

const renderHtml: ToolHandler = async (args) => {
  try {
    parseRenderArgs(args);
    return 'HTML rendered successfully.';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const renderSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'render',
    description:
      'Create and display a complete HTML document in the conversation. Proactively use this tool whenever an answer benefits from combining text and visuals, visual structure, diagrams, interactive demonstrations, or when prose alone would not be clear enough, even if the user did not explicitly request a visual. Output must be a complete, self-contained HTML file that works directly in an iframe — no build step, no local imports. To use React with JSX: load Babel standalone (<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>) and use <script type="text/babel" data-type="module"> instead of <script type="module">. For other libraries without JSX: load from a CDN (e.g. https://esm.sh/vue@3) and use <script type="module">. Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          description:
            'Complete, self-contained HTML. Must include <!doctype html> and run as-is in an iframe.',
        },
      },
      required: ['code'],
    },
  },
};

export const renderTool: ToolDefinition = {
  spec: renderSpec,
  handler: renderHtml,
};
