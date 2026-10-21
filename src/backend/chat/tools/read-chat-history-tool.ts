import { z } from 'zod';
import { readChatHistory } from '@/backend/conversations/chat-history-db';
import type { ChatTool } from '@/shared/chat/tool-types';

export const readChatHistorySpec: ChatTool = {
  type: 'function',
  function: {
    name: 'read_chat_history',
    description:
      'Read a past chat message and nearby text on the same branch. Both conversation_id and message_id from search_chat_history are required. Returns the message, up to two preceding and two following messages, timestamps, a source URL, and pagination cursors. Only user/assistant body text and user quotes are returned, never reasoning or tool output. Long messages are split into bounded chunks with offsets and total_chars. Pass a returned cursor unchanged with the same conversation_id and message_id to continue reading. Cite the source conversation when using history. Report what the messages say, preserving speaker roles. A user proposal can be summarized as a user proposal without requiring an assistant to have agreed.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        conversation_id: { type: 'string', minLength: 1 },
        message_id: { type: 'integer', minimum: 1 },
        cursor: {
          type: 'string',
          description: 'A previous_cursor or next_cursor returned by this tool.',
        },
      },
      required: ['conversation_id', 'message_id'],
    },
  },
};

export const executeReadChatHistory = async (
  args: unknown,
  context: { db: D1Database; userId: string },
  signal?: AbortSignal,
) => {
  const input = z
    .object({
      conversation_id: z.string().min(1).max(200),
      message_id: z.number().int().positive(),
      cursor: z.string().max(4096).optional(),
    })
    .strict()
    .parse(args);
  return JSON.stringify(
    await readChatHistory(context.db, { ...input, userId: context.userId }, signal),
  );
};
