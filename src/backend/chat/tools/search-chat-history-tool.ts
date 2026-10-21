import { z } from 'zod';
import { searchChatHistory } from '@/backend/conversations/chat-history-db';
import type { ChatTool } from '@/shared/chat/tool-types';

export const searchChatHistorySpec: ChatTool = {
  type: 'function',
  function: {
    name: 'search_chat_history',
    description:
      "Search the current user's past chat message bodies, excluding the current conversation. Returns up to 10 conversations with message IDs, short excerpts, source URLs, and a next_cursor. Titles are metadata only and are never searched. Use short keywords in the original language: queries containing CJK characters use literal substring matching; other queries use AND matching of word prefixes. Change keywords if needed. Excerpts are only leads: call read_chat_history before answering about past decisions. No results means no match was found, not that a discussion never happened. Report what the messages say, preserving speaker roles. A user proposal can be summarized as a user proposal without requiring an assistant to have agreed.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        cursor: {
          type: 'string',
          description: 'Pass next_cursor unchanged with the same query to read another page.',
        },
      },
      required: ['query'],
    },
  },
};

export const executeSearchChatHistory = async (
  args: unknown,
  context: { db: D1Database; userId: string; conversationId: string },
  signal?: AbortSignal,
) => {
  const input = z
    .object({ query: z.string().trim().min(1).max(200), cursor: z.string().max(4096).optional() })
    .strict()
    .parse(args);
  return JSON.stringify(
    await searchChatHistory(
      context.db,
      { ...input, userId: context.userId, conversationId: context.conversationId },
      signal,
    ),
  );
};
