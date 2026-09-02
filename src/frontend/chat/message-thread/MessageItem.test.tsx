import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import {
  chatState,
  registerChatToast,
  type ChatStatus,
} from '@/frontend/chat/agent-runtime/chat-state';
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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => async () => {},
}));

const notify = () => '';

afterEach(() => {
  vi.unstubAllGlobals();
  clearConversationMeta();
  clearMessageTree();
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

  it('renders persisted HTML in a fixed canvas and expands with its content height', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    let resizeCallback: ResizeObserverCallback | undefined;
    const resizeObserver: ResizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe = resizeObserver.observe;
        unobserve = resizeObserver.unobserve;
        disconnect = resizeObserver.disconnect;
      },
    );
    const message: Message = {
      id: 1,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [
        { type: 'content', content: '产物之前' },
        {
          type: 'research',
          items: [
            {
              kind: 'tool',
              data: {
                call: {
                  tool: 'render',
                  args: {
                    title: '会话内产物',
                    code: '<!doctype html><main>Inline preview</main>',
                  },
                },
                result: { result: 'HTML rendered successfully.' },
              },
            },
          ],
        },
        { type: 'content', content: '产物之后' },
      ],
      createdAt: '2026-08-04T08:00:00.000Z',
      completedAt: '2026-08-04T08:00:01.000Z',
    };

    const { container, getByRole, getByText } = renderTest(() => (
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
    const preview = container.querySelector('iframe');
    const before = getByText('产物之前');
    const after = getByText('产物之后');

    expect(preview).not.toBeNull();
    if (!preview) {
      throw new Error('HTML preview was not rendered');
    }
    const frameDocument = preview.contentDocument;
    if (!frameDocument?.body) {
      throw new Error('HTML preview document was not available');
    }
    Object.defineProperty(frameDocument.documentElement, 'clientHeight', {
      configurable: true,
      value: 384,
    });
    Object.defineProperty(frameDocument.documentElement, 'scrollHeight', {
      configurable: true,
      value: 840,
    });
    Object.defineProperty(preview, 'clientHeight', {
      configurable: true,
      value: 382,
    });
    Object.defineProperty(preview, 'offsetHeight', {
      configurable: true,
      value: 384,
    });
    const bodyRect = vi
      .spyOn(frameDocument.body, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 0, 960));

    expect(container.textContent).not.toContain('会话内产物');
    expect(preview.getAttribute('title')).toBe('HTML preview');
    expect(preview.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(preview.getAttribute('srcdoc')).toBe('<!doctype html><main>Inline preview</main>');
    expect(preview.style.height).toBe('384px');
    fireEvent.click(getByRole('button', { name: '展开' }));
    expect(preview.style.height).toBe('962px');
    expect(getByRole('button', { name: '固定' })).toBeDefined();
    expect(resizeObserver.observe).toHaveBeenCalledWith(frameDocument.documentElement);
    expect(resizeObserver.observe).toHaveBeenCalledWith(frameDocument.body);

    Object.defineProperty(frameDocument.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1240,
    });
    Object.defineProperty(frameDocument.documentElement, 'clientHeight', {
      configurable: true,
      value: 960,
    });
    bodyRect.mockReturnValue(new DOMRect(0, 0, 0, 1240));
    act(() => resizeCallback?.([], resizeObserver));
    expect(preview.style.height).toBe('1242px');

    Object.defineProperty(frameDocument.documentElement, 'clientHeight', {
      configurable: true,
      value: 1240,
    });
    Object.defineProperty(frameDocument.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1240,
    });
    bodyRect.mockReturnValue(new DOMRect(0, 0, 0, 180));
    act(() => resizeCallback?.([], resizeObserver));
    expect(preview.style.height).toBe('384px');

    fireEvent.click(getByRole('button', { name: '固定' }));
    expect(preview.style.height).toBe('384px');
    expect(getByRole('button', { name: '展开' })).toBeDefined();
    expect(resizeObserver.disconnect).toHaveBeenCalled();
    expect(before.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows only the HTML preview on the selected assistant branch', async () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree(
      [
        {
          id: 1,
          parentId: null,
          prevSibling: null,
          nextSibling: null,
          latestChild: 2,
          role: 'user',
          blocks: [{ type: 'content', content: '生成一个页面' }],
          createdAt: '2026-08-04T08:00:00.000Z',
          completedAt: '2026-08-04T08:00:00.000Z',
        },
        {
          id: 2,
          parentId: 1,
          prevSibling: null,
          nextSibling: 3,
          latestChild: null,
          role: 'assistant',
          blocks: [
            {
              type: 'research',
              items: [
                {
                  kind: 'tool',
                  data: {
                    call: {
                      tool: 'render',
                      args: { code: '<main>Branch A</main>' },
                    },
                    result: { result: 'HTML rendered successfully.' },
                  },
                },
              ],
            },
          ],
          createdAt: '2026-08-04T08:00:01.000Z',
          completedAt: '2026-08-04T08:00:02.000Z',
        },
        {
          id: 3,
          parentId: 1,
          prevSibling: 2,
          nextSibling: null,
          latestChild: null,
          role: 'assistant',
          blocks: [
            {
              type: 'research',
              items: [
                {
                  kind: 'tool',
                  data: {
                    call: {
                      tool: 'render',
                      args: { code: '<main>Branch B</main>' },
                    },
                    result: { result: 'HTML rendered successfully.' },
                  },
                },
              ],
            },
          ],
          createdAt: '2026-08-04T08:00:03.000Z',
          completedAt: '2026-08-04T08:00:04.000Z',
        },
      ],
      [1, 2],
    );

    const { container } = renderTest(() => (
      <ToastProvider>
        <MessageList />
      </ToastProvider>
    ));

    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<main>Branch A</main>');
    expect(container.querySelector('iframe')?.style.height).toBe('384px');

    await act(() => {
      setMessageTreeState({ currentPath: [1, 3] });
    });

    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<main>Branch B</main>');
    expect(container.querySelector('iframe')?.style.height).toBe('384px');
  });

  it('does not render HTML before a successful render result', () => {
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
          type: 'research',
          items: [
            {
              kind: 'tool',
              data: {
                call: { tool: 'render', args: { code: '<main>Pending</main>' } },
              },
            },
            {
              kind: 'tool',
              data: {
                call: { tool: 'render', args: { code: '<main>Failed</main>' } },
                result: { result: 'Error: Render failed' },
              },
            },
          ],
        },
      ],
      createdAt: '2026-08-04T08:00:00.000Z',
      completedAt: '2026-08-04T08:00:01.000Z',
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

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('button[title="展开完整画布"]')).toBeNull();
  });

  it('disables edit and retry while keeping branch enabled when chat is busy', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree(
      [
        {
          id: 1,
          parentId: null,
          prevSibling: null,
          nextSibling: null,
          latestChild: 2,
          role: 'user',
          blocks: [{ type: 'content', content: '问题' }],
          createdAt: '2026-08-04T08:00:00.000Z',
          completedAt: '2026-08-04T08:00:00.000Z',
        },
        {
          id: 2,
          parentId: 1,
          prevSibling: null,
          nextSibling: null,
          latestChild: null,
          role: 'assistant',
          blocks: [{ type: 'content', content: '回答' }],
          createdAt: '2026-08-04T08:00:01.000Z',
          completedAt: '2026-08-04T08:00:02.000Z',
        },
      ],
      [1, 2],
    );

    const { container } = renderTest(() => (
      <ToastProvider>
        <MessageList />
      </ToastProvider>
    ));
    const expectMessageActions = (busy: boolean) => {
      expect(container.querySelector('button[title="编辑消息"]')?.hasAttribute('disabled')).toBe(
        busy,
      );
      const retryButtons = container.querySelectorAll('button[title="重试生成"]');
      expect(retryButtons).toHaveLength(2);
      expect(Array.from(retryButtons).every((button) => button.hasAttribute('disabled'))).toBe(
        busy,
      );
      expect(
        container.querySelector('button[title="从这里创建分支会话"]')?.hasAttribute('disabled'),
      ).toBe(false);
    };

    expectMessageActions(false);
    for (const status of ['sending', 'streaming', 'stopping'] satisfies ChatStatus[]) {
      act(() => chatState.setStatus(status));
      expectMessageActions(true);
    }
    act(() => chatState.setStatus('idle'));
    expectMessageActions(false);
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
