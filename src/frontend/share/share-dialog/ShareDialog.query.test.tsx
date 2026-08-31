import { Component, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from './ShareDialog';

const rpc = vi.hoisted(() => ({
  createShare: vi.fn(),
  getShare: vi.fn(),
  revokeShare: vi.fn(),
}));

vi.mock('@/rpc/share', () => ({
  createConversationShareFn: rpc.createShare,
  getConversationShareFn: rpc.getShare,
  revokeConversationShareFn: rpc.revokeShare,
}));

vi.mock('@/frontend/conversations/session', () => ({
  selectAllConversations: () => [],
  useConversationsQuery: () => ({ data: undefined }),
}));

vi.mock('@/frontend/chat/agent-runtime/chat-state', () => ({
  useChatStatus: () => 'idle',
}));

vi.mock('@/frontend/conversations/conversation-tree/message-tree-state', () => ({
  useCurrentPath: () => [],
  useMessages: () => [],
}));

vi.mock('@/frontend/conversations/session/conversation-meta', () => ({
  useConversationId: () => 'conversation-1',
}));

vi.mock('@/frontend/app-shell/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}));

class TestErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p role='alert'>query failed</p> : this.props.children;
  }
}

const renderShareDialog = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 3,
        retryDelay: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <TestErrorBoundary>
        <ShareDialog open onOpenChange={() => undefined} />
      </TestErrorBoundary>
    </QueryClientProvider>,
  );

  return { client, ...view };
};

beforeEach(() => {
  rpc.getShare.mockReset().mockResolvedValue({ status: 'not_shared' });
  rpc.createShare.mockReset();
  rpc.revokeShare.mockReset();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('ShareDialog direct async query', () => {
  it('attempts the share request once when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.getShare.mockRejectedValue(new Error('share failed'));
    const view = renderShareDialog();

    await screen.findByRole('alert');

    expect(rpc.getShare).toHaveBeenCalledOnce();
    view.unmount();
    view.client.clear();
  });

  it('does not refetch a successful request on focus or reconnect', async () => {
    const view = renderShareDialog();

    await screen.findByText('Anyone with the link can view this conversation.');
    expect(rpc.getShare).toHaveBeenCalledOnce();

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });

    expect(rpc.getShare).toHaveBeenCalledOnce();

    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await Promise.resolve();
    });

    expect(rpc.getShare).toHaveBeenCalledOnce();
    view.unmount();
    view.client.clear();
  });
});
