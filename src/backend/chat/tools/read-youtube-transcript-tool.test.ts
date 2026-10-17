import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupadataError } from '@supadata/js';
import { readYoutubeTranscriptTool } from './read-youtube-transcript-tool';

const { transcriptRequest, jobStatusRequest, pollDelay } = vi.hoisted(() => ({
  transcriptRequest: vi.fn(),
  jobStatusRequest: vi.fn(),
  pollDelay:
    vi.fn<
      (milliseconds: number, value: undefined, options: { signal?: AbortSignal }) => Promise<void>
    >(),
}));
vi.mock('node:timers/promises', () => ({
  setTimeout: pollDelay,
  default: { setTimeout: pollDelay },
}));
vi.mock('@supadata/js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@supadata/js')>();
  return {
    ...original,
    Supadata: class {
      transcript = Object.assign(transcriptRequest, { getJobStatus: jobStatusRequest });
    },
  };
});

beforeEach(() => {
  vi.stubEnv('SUPADATA_API_KEY', 'supadata-test-key');
  transcriptRequest.mockReset();
  jobStatusRequest.mockReset();
  pollDelay.mockReset();
  pollDelay.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

describe('read_youtube_transcript', () => {
  it('reads a synchronous transcript without polling', async () => {
    transcriptRequest.mockResolvedValue({
      content: 'Full transcript',
      lang: 'en',
      availableLangs: ['en'],
    });
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toBe('Full transcript');
    expect(transcriptRequest).toHaveBeenCalledWith({ url: videoUrl, text: true, mode: 'auto' });
    expect(jobStatusRequest).not.toHaveBeenCalled();
  });

  it('polls a queued job until its transcript is complete', async () => {
    transcriptRequest.mockResolvedValue({ jobId: 'job-1' });
    jobStatusRequest.mockResolvedValueOnce({ status: 'queued' }).mockResolvedValueOnce({
      status: 'completed',
      result: {
        content: [
          { text: 'First line', offset: 0, duration: 1, lang: 'en' },
          { text: 'Second line', offset: 1, duration: 1, lang: 'en' },
        ],
        lang: 'en',
        availableLangs: ['en'],
      },
    });
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toBe(
      'First line\nSecond line',
    );
    expect(jobStatusRequest).toHaveBeenCalledTimes(2);
    expect(jobStatusRequest).toHaveBeenCalledWith('job-1');
    expect(pollDelay).toHaveBeenCalledWith(3_000, undefined, { signal: undefined });
  });

  it('returns an asynchronous job failure', async () => {
    transcriptRequest.mockResolvedValue({ jobId: 'job-1' });
    jobStatusRequest.mockResolvedValue({
      status: 'failed',
      error: { message: 'Transcript unavailable' },
    });
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toBe(
      'Error: Transcript unavailable',
    );
    expect(jobStatusRequest).toHaveBeenCalledOnce();
  });

  it('limits polling to 60 attempts', async () => {
    transcriptRequest.mockResolvedValue({ jobId: 'job-1' });
    jobStatusRequest.mockResolvedValue({ status: 'active' });
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toBe(
      'Error: Transcript job timed out after polling',
    );
    expect(jobStatusRequest).toHaveBeenCalledTimes(60);
  });

  it('cancels while waiting to poll without requesting job status', async () => {
    transcriptRequest.mockResolvedValue({ jobId: 'job-1' });
    const controller = new AbortController();
    pollDelay.mockImplementationOnce(
      (_delay, _value, options) =>
        new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
          controller.abort();
        }),
    );
    await expect(
      readYoutubeTranscriptTool.handler({ url: videoUrl }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(jobStatusRequest).not.toHaveBeenCalled();
  });

  it('does not send a request after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readYoutubeTranscriptTool.handler({ url: videoUrl }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(transcriptRequest).not.toHaveBeenCalled();
  });

  it('reports a missing key without contacting Supadata', async () => {
    vi.stubEnv('SUPADATA_API_KEY', '');
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toBe(
      'Error: SUPADATA_API_KEY is not set',
    );
    expect(transcriptRequest).not.toHaveBeenCalled();
  });

  it('rejects a non-YouTube page', async () => {
    await expect(
      readYoutubeTranscriptTool.handler({ url: 'https://example.com/watch?v=id' }),
    ).rejects.toThrow('YouTube video URL');
    expect(transcriptRequest).not.toHaveBeenCalled();
  });

  it('reports an expected Supadata error', async () => {
    transcriptRequest.mockRejectedValue(
      new SupadataError({
        error: 'unauthorized',
        message: 'Invalid API key',
        details: 'Key rejected',
      }),
    );
    expect(await readYoutubeTranscriptTool.handler({ url: videoUrl })).toContain('Invalid API key');
  });

  it('propagates unexpected failures to the tool executor', async () => {
    transcriptRequest.mockRejectedValue(new TypeError('Unexpected failure'));
    await expect(readYoutubeTranscriptTool.handler({ url: videoUrl })).rejects.toThrow(
      'Unexpected failure',
    );
  });
});
