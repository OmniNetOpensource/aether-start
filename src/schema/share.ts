import { z } from 'zod';

export const createShareSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().nullable(),
  /** 客户端正在看的分支;路径归客户端管,服务端校验合法后据此构建快照 */
  currentPath: z.array(z.number().int().positive()),
});

export const shareConversationIdSchema = z.object({
  conversationId: z.string().min(1),
});

export const shareTokenPayloadSchema = z.object({
  token: z.string().min(1).max(128),
});
