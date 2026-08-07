import { z } from 'zod';

export const redeemInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
