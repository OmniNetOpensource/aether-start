import { z } from 'zod';

const listCursorSchema = z
  .object({
    is_pinned: z.union([z.literal(0), z.literal(1)]),
    sort_at: z.string(),
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable();

const searchCursorSchema = z
  .object({
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable();

export const listConversationsPageSchema = z.object({
  limit: z.number().int().positive().max(100),
  cursor: listCursorSchema,
});

export const searchConversationsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().positive().max(50),
  cursor: searchCursorSchema,
});

export const conversationIdSchema = z.object({
  id: z.string().min(1),
});

export const conversationPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  model: z.string().nullable().optional(),
  messages: z.array(z.record(z.string(), z.any())),
  created_at: z.string(),
  updated_at: z.string(),
});

export const branchConversationSchema = z.object({
  id: z.string().min(1),
  messageId: z.number().int().positive(),
});

export const updateConversationTitleSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
});

export const setConversationPinnedSchema = z.object({
  id: z.string().min(1),
  pinned: z.boolean(),
});
