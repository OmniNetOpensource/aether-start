import { fetchUrlTool } from './fetch-tool';
import { readImageTool } from './read-image-tool';
import { readYoutubeTranscriptTool } from './read-youtube-transcript-tool';
import { executeSearchChatHistory, searchChatHistorySpec } from './search-chat-history-tool';
import { executeReadChatHistory, readChatHistorySpec } from './read-chat-history-tool';
import { searchTool } from './search-tool';
// import { renderTool } from './render-tool';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import { log } from '@/backend/chat/logger';
import type { ChatTool } from '@/shared/chat/tool-types';

type RegisteredTool = {
  spec: ChatTool;
  handler: (
    args: unknown,
    signal: AbortSignal | undefined,
    context: Parameters<typeof executeSearchChatHistory>[1],
  ) => Promise<string>;
};

export const getToolRegistry = (): RegisteredTool[] => {
  const env = getServerEnv();
  const tools: RegisteredTool[] = [
    fetchUrlTool,
    readImageTool,
    readYoutubeTranscriptTool,
    // renderTool,
    {
      spec: searchChatHistorySpec,
      handler: (args, signal, context) => executeSearchChatHistory(args, context, signal),
    },
    {
      spec: readChatHistorySpec,
      handler: (args, signal, context) => executeReadChatHistory(args, context, signal),
    },
  ];

  if (env.SERP_API_KEY || env.EVERYINFRA_API_KEY) {
    tools.push(searchTool);
  } else {
    log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY and EVERYINFRA_API_KEY)');
  }

  return tools;
};
