import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createChatSessionActions,
  createInitialChatSessionState,
  type ChatSessionState,
} from '@/features/conversations/session';
import type { ChatRuntimeState } from '@/features/chat/agent-runtime/chat-runtime-state';
import { ToastProvider } from '@/shared/app-shell/toast-context';
import type { Message } from './message';
import { MessageItem } from './MessageItem';

describe('MessageItem', () => {
  it('renders user text, quote, attachment, and following text in block order', () => {
    const message: Message = {
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
    };
    let session: ChatSessionState = createInitialChatSessionState('', '');
    const sessionActions = createChatSessionActions(
      () => session,
      (update) => {
        session = typeof update === 'function' ? update(session) : update;
      },
    );
    const notify = () => '';
    const runtime: ChatRuntimeState = {
      getSession: () => session,
      session: sessionActions,
      getStatus: () => 'idle',
      setStatus: () => {},
      toast: { info: notify, success: notify, warning: notify, error: notify },
    };

    const { container } = render(
      <ToastProvider>
        <MessageItem
          message={message}
          index={0}
          depth={1}
          isStreaming={false}
          isLastInPath
          status='idle'
          branchInfo={null}
          editingState={null}
          runtime={runtime}
          onStartEditing={() => {}}
          onEditDocumentChange={() => {}}
          onCancelEditing={() => {}}
          onSubmitEdit={async () => {}}
          onRetry={async () => {}}
          onNavigateBranch={() => {}}
        />
      </ToastProvider>,
    );

    expect(container.querySelector('.text-base')?.textContent).toBe(
      '开头引用内容图片.png结尾\n\n旧正文',
    );
    expect(container.querySelector('.text-2xs')?.textContent).toBe('8/4, 04:00 PM');
  });
});
