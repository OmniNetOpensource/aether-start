import { describe, expect, it } from 'vitest';
import { buildReadClientPayload, parseFetchClientPayload } from './fetch-result-payload';

describe('read client payload', () => {
  it('selects transcript output by tool name without a response_type argument', () => {
    expect(
      buildReadClientPayload(
        'read_youtube_transcript',
        { url: 'https://youtu.be/video' },
        'Caption text',
      ),
    ).toEqual({
      type: 'youtube',
      url: 'https://youtu.be/video',
      content: 'Caption text',
    });
  });
  it('keeps webpage output as markdown', () => {
    expect(
      buildReadClientPayload('fetch_url', { url: 'https://example.com' }, '# Article'),
    ).toEqual({ type: 'markdown', url: 'https://example.com', content: '# Article' });
  });
  it('preserves error results for the new read tools', () => {
    expect(
      buildReadClientPayload('read_image', { url: 'https://example.com/image' }, 'Error: HTTP 403'),
    ).toEqual({ type: 'error', url: 'https://example.com/image', message: 'HTTP 403' });
  });
  it.each([
    {
      type: 'image',
      url: 'https://example.com/image',
      data_url: 'data:image/png;base64,AQID',
      mime_type: 'image/png',
      size_bytes: 3,
    },
    { type: 'youtube', url: 'https://youtu.be/video', content: 'Saved captions' },
  ])('keeps saved $type results readable', (payload) => {
    expect(parseFetchClientPayload(JSON.stringify(payload))).toEqual(payload);
  });
});
