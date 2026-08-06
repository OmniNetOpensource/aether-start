import { afterEach, describe, expect, it } from 'vitest';
import { act, renderTest } from '@/test/render';
import { clearArtifacts } from '@/features/chat/artifact/artifact-state';
import { chatRuntime, registerChatToast } from '@/features/chat/agent-runtime/chat-runtime';
import {
  clearMessageTree,
  initializeMessageTree,
  setMessageTreeState,
} from '@/features/conversations/conversation-tree/message-tree-state';
import { clearConversationMeta } from '@/features/conversations/session/conversation-meta';
import { ToastProvider } from '@/shared/app-shell/toast-context';
import type { Message } from './message';
import { MessageItem } from './MessageItem';
import { MessageList } from './MessageList';

const notify = () => '';

afterEach(() => {
  clearConversationMeta();
  clearMessageTree();
  clearArtifacts();
  chatRuntime.setStatus('idle');
});

describe('MessageItem', () => {
  it('renders user text, quote, attachment, and following text in block order', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
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

    const { container } = renderTest(() => (
      <ToastProvider>
        <MessageItem
          message={message}
          depth={1}
          isStreaming={false}
          isLastInPath
          branchInfo={null}
          editingState={null}
          onStartEditing={() => {}}
          onEditDocumentChange={() => {}}
          onCancelEditing={() => {}}
          onSubmitEdit={async () => {}}
          onRetry={async () => {}}
        />
      </ToastProvider>
    ));

    expect(container.querySelector('.text-base')?.textContent).toBe(
      '开头引用内容图片.png结尾\n\n旧正文',
    );
    expect(container.querySelector('.text-2xs')?.textContent).toBe('8/4, 04:00 PM');
  });

  it('updates an existing message while streaming', async () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    const initialMessage: Message = {
      id: 1,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [{ type: 'content', content: '部分回复' }],
      createdAt: '2026-08-04T08:00:00.000Z',
      completedAt: null,
    };
    initializeMessageTree([initialMessage], [1]);
    chatRuntime.setStatus('streaming');

    const { container } = renderTest(() => (
      <ToastProvider>
        <MessageList />
      </ToastProvider>
    ));

    expect(container.textContent).toContain('部分回复');

    await act(() => {
      setMessageTreeState({
        messages: [{ ...initialMessage, blocks: [{ type: 'content', content: '完整回复' }] }],
      });
    });

    expect(container.textContent).toContain('完整回复');
    expect(container.textContent).not.toContain('部分回复');
  });
});
