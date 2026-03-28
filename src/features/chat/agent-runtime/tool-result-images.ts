import { parseDataUrl } from '@/shared/worker/base64';

export type ParsedToolResultImage = {
  dataUrl: string;
  mediaType: string;
  base64: string;
};

export const parseToolResultImage = (raw: string): ParsedToolResultImage | null => {
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.type !== 'image' ||
      typeof parsed.data_url !== 'string'
    ) {
      return null;
    }

    const image = parseDataUrl(parsed.data_url);
    if (!image) {
      return null;
    }

    return {
      dataUrl: parsed.data_url,
      mediaType: image.mimeType,
      base64: image.base64,
    };
  } catch {
    return null;
  }
};
