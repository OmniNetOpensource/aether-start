import { z } from 'zod';

const createSiteSchema = z.object({ id: z.string() });
const createDeploySchema = z.object({ id: z.string() });
const uploadFileSchema = z.object({ mime_type: z.string().optional() });
const deployStatusSchema = z.object({
  state: z.string(),
  url: z.string().optional(),
  ssl_url: z.string().optional(),
  error_message: z.string().nullable().optional(),
});

const parseJson = <T>(text: string, schema: z.ZodType<T>, label: string) => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Netlify ${label}: invalid JSON response`);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Netlify ${label}: unexpected response`);
  }
  return parsed.data;
};

export const parseCreateSiteResponse = (text: string) =>
  parseJson(text, createSiteSchema, 'create site');

export const parseCreateDeployResponse = (text: string) =>
  parseJson(text, createDeploySchema, 'create deploy');

export const parseUploadFileResponse = (text: string) =>
  parseJson(text, uploadFileSchema, 'upload file');

export const parseDeployStatusResponse = (text: string) =>
  parseJson(text, deployStatusSchema, 'get deploy status');
