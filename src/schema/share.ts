import { z } from 'zod';

export const createShareSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().nullable(),
});

export const shareConversationIdSchema = z.object({
  conversationId: z.string().min(1),
});

export const shareTokenPayloadSchema = z.object({
  token: z.string().min(1).max(128),
});
