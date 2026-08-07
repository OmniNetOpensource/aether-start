import { z } from 'zod';

export const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      display_name: z.string().optional(),
    }),
  ),
});

export const geminiModelListSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string(),
      supportedGenerationMethods: z.array(z.string()).nullable(),
    }),
  ),
  nextPageToken: z.string().nullish(),
});

export const availableModelsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  }),
);
