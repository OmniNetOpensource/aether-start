import { Component, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({
  getPublicConversationShare: vi.fn(),
}));

const routeHost = vi.hoisted(() => {
  let component: () => ReactNode = () => null;

  return {
    getComponent: () => component,
    registerComponent: (nextComponent: () => ReactNode) => {
      component = nextComponent;
    },
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => {
    routeHost.registerComponent(options.component);
    return {
      options,
      useParams: () => ({ token: 'public-token' }),
    };
  },
  Link: () => null,
}));

vi.mock('@/rpc/share', () => ({
  getPublicConversationShareFn: rpc.getPublicConversationShare,
}));

vi.mock('@/frontend/design-system/icons', () => ({ Loader2: () => null }));
vi.mock('@/frontend/share/public-thread', () => ({ ReadonlyMessageList: () => null }));

import './$token';

class TestErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p role='alert'>query failed</p> : this.props.children;
  }
}

const renderPublicShare = () => {
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
  const PublicSharePage = routeHost.getComponent();
  const view = render(
    <QueryClientProvider client={client}>
      <TestErrorBoundary>
        <PublicSharePage />
      </TestErrorBoundary>
    </QueryClientProvider>,
  );

  return { client, ...view };
};

beforeEach(() => {
  rpc.getPublicConversationShare.mockReset().mockResolvedValue({ status: 'not_found' });
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('public share direct async query', () => {
  it('attempts the request once when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.getPublicConversationShare.mockRejectedValue(new Error('share request failed'));
    const view = renderPublicShare();

    await screen.findByRole('alert');

    expect(rpc.getPublicConversationShare).toHaveBeenCalledOnce();
    expect(rpc.getPublicConversationShare).toHaveBeenCalledWith({
      data: { token: 'public-token' },
    });
    view.unmount();
    view.client.clear();
  });

  it('does not refetch a successful request on focus or reconnect', async () => {
    const view = renderPublicShare();

    await screen.findByText('分享不存在');
    expect(rpc.getPublicConversationShare).toHaveBeenCalledOnce();

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });

    expect(rpc.getPublicConversationShare).toHaveBeenCalledOnce();

    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await Promise.resolve();
    });

    expect(rpc.getPublicConversationShare).toHaveBeenCalledOnce();
    view.unmount();
    view.client.clear();
  });
});
