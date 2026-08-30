import { afterEach, describe, expect, it } from 'vitest';
import { act, renderTest } from '@/test/render';
import { clearArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { chatState, registerChatToast } from '@/frontend/chat/agent-runtime/chat-state';
import {
  clearMessageTree,
  initializeMessageTree,
  setMessageTreeState,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import { clearConversationMeta } from '@/frontend/conversations/session/conversation-meta';
import { ToastProvider } from '@/frontend/app-shell/toast-context';
import type { Message } from '@/shared/chat/message';
import { MessageItem } from './MessageItem';
import { MessageList } from './MessageList';

const notify = () => '';

afterEach(() => {
  clearConversationMeta();
  clearMessageTree();
  clearArtifacts();
  chatState.setStatus('idle');
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
          onBranch={async () => {}}
        />
      </ToastProvider>
    ));

    expect(
      Array.from(container.querySelector('.text-base')?.children ?? []).map(
        (element) => element.getAttribute('data-content-chip') ?? element.textContent,
      ),
    ).toEqual(['开头', 'quote', 'attachment', '结尾', '\n\n旧正文']);
    expect(
      container
        .querySelector('[data-content-chip="attachment"] button')
        ?.getAttribute('aria-label'),
    ).toBe('预览图片 图片.png');
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
    chatState.setStatus('streaming');

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

  it('renders persisted structured error details', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    const message: Message = {
      id: 1,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [
        {
          type: 'error',
          message: 'OpenAI request failed',
          error: {
            code: 'server_error',
            provider: 'openai',
            model: 'gpt-5.4',
            backend: 'api.example.com/v1',
            status: 500,
            retryable: true,
            details: 'upstream unavailable',
          },
        },
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
          onBranch={async () => {}}
        />
      </ToastProvider>
    ));

    expect(container.textContent).toContain('Provider server error');
    expect(container.textContent).toContain('Provider: openai');
    expect(container.textContent).toContain('Model: gpt-5.4');
    expect(container.textContent).toContain('Backend: api.example.com/v1');
    expect(container.textContent).toContain('HTTP status: 500');
    expect(container.textContent).toContain('Retryable: yes');
    expect(container.textContent).toContain('Details: upstream unavailable');
  });
});
