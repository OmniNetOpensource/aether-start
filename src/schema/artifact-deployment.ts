import { z } from 'zod';

export const deployToNetlifySchema = z.object({
  artifactId: z.string().min(1),
  html: z.string().min(1),
});
