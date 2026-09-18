import { Component, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';

const rpc = vi.hoisted(() => ({
  getQuota: vi.fn(),
  redeemCode: vi.fn(),
  getSessionState: vi.fn(),
  createRedeemCode: vi.fn(),
  deactivateRedeemCode: vi.fn(),
  listRedeemCodes: vi.fn(),
}));

vi.mock('@/rpc/quota', () => ({
  getQuotaFn: rpc.getQuota,
  redeemCodeFn: rpc.redeemCode,
}));

vi.mock('@/rpc/auth', () => ({
  getSessionStateFn: rpc.getSessionState,
}));

vi.mock('@/rpc/redeem-codes', () => ({
  adminCreateRedeemCodeFn: rpc.createRedeemCode,
  adminDeactivateRedeemCodeFn: rpc.deactivateRedeemCode,
  adminListRedeemCodesFn: rpc.listRedeemCodes,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      availableModels: [{ id: 'claudeOpus46Ikun', name: 'opus-4-6+ikun' }],
    }),
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/frontend/auth/client', () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock('@/frontend/app-shell/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
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

const renderSettings = () => {
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
        <SettingsModal open onOpenChange={() => undefined} />
      </TestErrorBoundary>
    </QueryClientProvider>,
  );

  return { client, ...view };
};

beforeEach(() => {
  rpc.getQuota.mockReset().mockResolvedValue({ balance: 12 });
  rpc.getSessionState.mockReset().mockResolvedValue({ isAdmin: true });
  rpc.listRedeemCodes.mockReset().mockResolvedValue({ items: [] });
  rpc.redeemCode.mockReset();
  rpc.createRedeemCode.mockReset();
  rpc.deactivateRedeemCode.mockReset();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('SettingsModal direct async queries', () => {
  it.each([
    {
      name: 'quota',
      fail: () => rpc.getQuota.mockRejectedValue(new Error('quota failed')),
      request: rpc.getQuota,
    },
    {
      name: 'session',
      fail: () => rpc.getSessionState.mockRejectedValue(new Error('session failed')),
      request: rpc.getSessionState,
    },
    {
      name: 'redeem codes',
      fail: () => rpc.listRedeemCodes.mockRejectedValue(new Error('codes failed')),
      request: rpc.listRedeemCodes,
    },
  ])('attempts the $name request once when it fails', async ({ fail, request }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fail();
    const view = renderSettings();

    await screen.findByRole('alert');

    expect(request).toHaveBeenCalledOnce();
    view.unmount();
    view.client.clear();
  });

  it('does not refetch successful requests on focus or reconnect', async () => {
    const view = renderSettings();

    await screen.findByText('12 credits');
    await screen.findByText('No redeem codes yet.');
    expect(rpc.getQuota).toHaveBeenCalledOnce();
    expect(rpc.getSessionState).toHaveBeenCalledOnce();
    expect(rpc.listRedeemCodes).toHaveBeenCalledOnce();

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });

    expect(rpc.getQuota).toHaveBeenCalledOnce();
    expect(rpc.getSessionState).toHaveBeenCalledOnce();
    expect(rpc.listRedeemCodes).toHaveBeenCalledOnce();

    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await Promise.resolve();
    });

    expect(rpc.getQuota).toHaveBeenCalledOnce();
    expect(rpc.getSessionState).toHaveBeenCalledOnce();
    expect(rpc.listRedeemCodes).toHaveBeenCalledOnce();
    view.unmount();
    view.client.clear();
  });

  it.each([
    { isAdmin: true, hasRefresh: true },
    { isAdmin: false, hasRefresh: false },
  ])('sets model refresh permission from the session', async ({ isAdmin, hasRefresh }) => {
    rpc.getSessionState.mockResolvedValue({ isAdmin });
    const view = renderSettings();

    await waitFor(() =>
      expect(view.client.getQueryData(['settings', 'session'])).toEqual({ isAdmin }),
    );

    if (hasRefresh) {
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined();
    } else {
      expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    }
    view.unmount();
    view.client.clear();
  });
});
