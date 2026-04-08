import { GoogleGenAI } from '@google/genai';
import type { BackendConfig } from './backend-config';

export const getGeminiClient = (config: BackendConfig) =>
  new GoogleGenAI({
    vertexai: false,
    apiKey: config.apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      baseUrl: config.baseURL,
      headers: config.defaultHeaders,
    },
  });
