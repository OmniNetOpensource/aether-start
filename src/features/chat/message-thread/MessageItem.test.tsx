import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useChatSessionStore } from '@/features/conversations/session';
import { useEditingStore } from './useEditingStore';
import { MessageItem } from './MessageItem';

describe('MessageItem', () => {
  afterEach(() => {
    useChatSessionStore.getState().clearSession();
    useEditingStore.getState().clear();
  });

  it('renders user text, quote, attachment, and following text in block order', () => {
    useChatSessionStore.getState().initializeTree(
      [
        {
          id: 1,
          parentId: null,
          prevSibling: null,
          nextSibling: null,
          latestChild: null,
          role: 'user',
          blocks: [
            { type: 'content', content: '开头' },
            { type: 'quotes', quotes: [{ id: 'quote-1', text: '引用内容' }] },
            {
              type: 'attachments',
              attachments: [
                {
                  id: 'image-1',
                  kind: 'image',
                  name: '图片.png',
                  size: 12,
                  mimeType: 'image/png',
                  url: 'data:image/png;base64,AA==',
                },
              ],
            },
            { type: 'content', content: '结尾' },
            { type: 'content', content: '旧正文' },
          ],
          createdAt: '2026-08-04T08:00:00.000Z',
          completedAt: '2026-08-04T08:00:00.000Z',
        },
      ],
      [1],
    );

    const { container } = render(
      <MessageItem messageId={1} index={0} depth={1} isStreaming={false} />,
    );

    expect(container.querySelector('.text-base')?.textContent).toBe(
      '开头引用内容图片.png结尾\n\n旧正文',
    );
  });
});
