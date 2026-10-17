import { setTimeout } from 'node:timers/promises';
import { Supadata, SupadataError, type Transcript } from '@supadata/js';
import { z } from 'zod';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import type { ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';

const transcriptText = (transcript: Transcript): string =>
  typeof transcript.content === 'string'
    ? transcript.content
    : transcript.content.map((chunk) => chunk.text).join('\n');

const readYoutubeTranscript: ToolHandler = async (args, signal) => {
  const { url } = z.object({ url: z.string().url() }).strict().parse(args);
  const videoUrl = new URL(url);
  if (
    !['http:', 'https:'].includes(videoUrl.protocol) ||
    !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(videoUrl.hostname)
  ) {
    throw new Error('read_youtube_transcript requires a YouTube video URL');
  }
  signal?.throwIfAborted();
  const { SUPADATA_API_KEY: apiKey } = getServerEnv();
  if (!apiKey) {
    return 'Error: SUPADATA_API_KEY is not set';
  }

  const supadata = new Supadata({ apiKey });
  try {
    const result = await supadata.transcript({ url, text: true, mode: 'auto' });
    signal?.throwIfAborted();
    if (!('jobId' in result)) {
      return transcriptText(result);
    }
    for (let pollCount = 0; pollCount < 60; pollCount += 1) {
      await setTimeout(3_000, undefined, { signal });
      const job = await supadata.transcript.getJobStatus(result.jobId);
      signal?.throwIfAborted();
      if (job.status === 'completed' && job.result) {
        return transcriptText(job.result);
      }
      if (job.status === 'failed') {
        return `Error: ${job.error?.message ?? 'Supadata transcript job failed'}`;
      }
    }
    return 'Error: Transcript job timed out after polling';
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (error instanceof SupadataError) {
      return `Error: Supadata ${error.message}`;
    }
    throw error;
  }
};

export const readYoutubeTranscriptTool: ToolDefinition = {
  spec: {
    type: 'function',
    function: {
      name: 'read_youtube_transcript',
      description:
        'Read the transcript or subtitles of a YouTube video. Returns text only; does not read video frames.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { url: { type: 'string', description: 'The YouTube video URL' } },
        required: ['url'],
      },
    },
  },
  handler: readYoutubeTranscript,
};
