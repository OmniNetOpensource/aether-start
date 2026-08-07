import { z } from 'zod';

export const listRedeemCodesSchema = z.object({
  limit: z.number().int().positive().max(100),
  cursor: z
    .object({
      created_at: z.string(),
      id: z.string(),
    })
    .nullable(),
});

export const createRedeemCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  amount: z.number().int().positive().max(1_000_000),
  expiresAt: z.string().nullable().optional(),
});

export const redeemCodeIdSchema = z.object({ id: z.string().min(1) });
