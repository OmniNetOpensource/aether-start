import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolCall, getAvailableTools } from './tool-executor';
import { readImageTool } from '@/backend/chat/tools/read-image-tool';
import { readYoutubeTranscriptTool } from '@/backend/chat/tools/read-youtube-transcript-tool';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const availableToolNames = () => getAvailableTools().map((tool) => tool.function.name);

describe('getAvailableTools', () => {
  it('exposes search when only EVERYINFRA_API_KEY is configured', () => {
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('EVERYINFRA_API_KEY', 'test-token');

    expect(availableToolNames()).toContain('search');
  });

  it('exposes search when only SERP_API_KEY is configured', () => {
    vi.stubEnv('SERP_API_KEY', 'test-key');
    vi.stubEnv('EVERYINFRA_API_KEY', '');

    expect(availableToolNames()).toContain('search');
  });

  it('hides search when only the legacy fetch credential is configured', () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'legacy-token');
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('EVERYINFRA_API_KEY', '');

    expect(availableToolNames()).not.toContain('search');
  });
});

describe('separate read tools', () => {
  it('publishes both independent tools', () => {
    expect(availableToolNames()).toEqual(
      expect.arrayContaining(['fetch_url', 'read_image', 'read_youtube_transcript']),
    );
  });

  it('passes image bytes to the model and a preview payload to the client', async () => {
    const image = {
      type: 'image',
      data_url: 'data:image/png;base64,AQID',
      mime_type: 'image/png',
      size_bytes: 3,
    };
    vi.spyOn(readImageTool, 'handler').mockResolvedValue(JSON.stringify(image));
    const executed = await executeToolCall({
      id: 'read-image-1',
      name: 'read_image',
      args: { url: 'https://example.com/image.png' },
    });
    expect(JSON.parse(executed.result.result)).toEqual(image);
    const event = executed.events[0];
    if (event.type !== 'tool_result') throw new Error('Missing tool result');
    expect(JSON.parse(event.result)).toEqual({ ...image, url: 'https://example.com/image.png' });
  });

  it('preserves complete transcript text for the model and its typed client result', async () => {
    vi.spyOn(readYoutubeTranscriptTool, 'handler').mockResolvedValue('Video transcript');
    const executed = await executeToolCall({
      id: 'read-youtube-1',
      name: 'read_youtube_transcript',
      args: { url: 'https://youtu.be/jNQXAC9IVRw' },
    });
    expect(executed.result.result).toBe('Video transcript');
    const event = executed.events[0];
    if (event.type !== 'tool_result') throw new Error('Missing tool result');
    expect(JSON.parse(event.result)).toEqual({
      type: 'youtube',
      url: 'https://youtu.be/jNQXAC9IVRw',
      content: 'Video transcript',
    });
  });
});
