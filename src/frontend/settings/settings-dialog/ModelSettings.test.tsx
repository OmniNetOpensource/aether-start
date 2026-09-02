import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import { ModelSettings } from './ModelSettings';

const INITIAL_MODEL_ID = 'ikun:claude-opus-4-8';
const router = vi.hoisted(() => ({
  availableModels: [
    { id: 'ikun:claude-opus-4-8', name: 'Opus 4.8' },
    { id: 'ikun:gpt-5.4', name: 'GPT 5.4' },
    { id: 'gemini-aistudio:gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ],
}));
const rpc = vi.hoisted(() => ({
  refreshAvailableModels: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({ availableModels: router.availableModels }),
  }),
}));

vi.mock('@/rpc/chat-options', () => ({
  getAvailableModelsFn: vi.fn(),
  refreshAvailableModelsFn: rpc.refreshAvailableModels,
}));

vi.mock('@/frontend/app-shell/useToast', () => ({
  useToast: () => toast,
}));

const renderModelSettings = (canRefreshModels = false) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return {
    client,
    ...renderTest(
      () => <ModelSettings canRefreshModels={canRefreshModels} />,
      (children) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    ),
  };
};

beforeEach(() => {
  setCurrentModelId(INITIAL_MODEL_ID);
  rpc.refreshAvailableModels.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('ModelSettings', () => {
  it('shows the current model and selects a filtered model', () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.8',
    });
    expect(screen.getByText(INITIAL_MODEL_ID)).toBeDefined();

    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'GPT 5.4' } });

    expect(screen.queryByRole('button', { name: 'Opus 4.8' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gemini 2.5 Pro' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));

    expect(currentModelId()).toBe('ikun:gpt-5.4');
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Choose model, current model is GPT 5.4' }),
    ).toBeDefined();
  });

  it('keeps an unavailable model visible instead of falling back', () => {
    setCurrentModelId('retired:model');
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is unavailable: retired:model',
    });
    expect(screen.getByText('Current model unavailable')).toBeDefined();
    expect(screen.getByText('retired:model')).toBeDefined();

    fireEvent.click(trigger);
    fireEvent.input(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('No matching models.')).toBeDefined();
    expect(currentModelId()).toBe('retired:model');
  });

  it('selects the highlighted search result with Enter', () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.8',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'gemini-aistudio' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(currentModelId()).toBe('gemini-aistudio:gemini-2.5-pro');
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
  });

  it('moves through the unfiltered model list with arrow keys', () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.8',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(currentModelId()).toBe('ikun:gpt-5.4');
    expect(trigger).toBe(document.activeElement);
  });

  it('leaves Home and End available for editing the search text', () => {
    renderModelSettings();

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.8' }),
    );
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'gpt' } });

    expect(fireEvent.keyDown(search, { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(search, { key: 'End' })).toBe(true);
    expect(currentModelId()).toBe(INITIAL_MODEL_ID);
  });

  it('only shows the refresh control with permission', () => {
    const view = renderModelSettings();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    view.unmount();
    view.client.clear();

    renderModelSettings(true);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDefined();
  });

  it('disables the refresh control while the request is pending', async () => {
    const refreshedModels = [{ id: INITIAL_MODEL_ID, name: 'Refreshed Opus' }];
    let finishRefresh: (models: typeof refreshedModels) => void = () => undefined;
    const pendingRefresh = new Promise<typeof refreshedModels>((resolve) => {
      finishRefresh = resolve;
    });
    rpc.refreshAvailableModels.mockReturnValue(pendingRefresh);
    renderModelSettings(true);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const pendingButton = screen.getByRole('button', { name: 'Refreshing...' });
    expect(pendingButton).toHaveProperty('disabled', true);
    expect(rpc.refreshAvailableModels).toHaveBeenCalledOnce();

    await act(async () => {
      finishRefresh(refreshedModels);
      await pendingRefresh;
    });

    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveProperty('disabled', false);
  });

  it('updates the model query and reports a successful refresh', async () => {
    const refreshedModels = [
      { id: INITIAL_MODEL_ID, name: 'Refreshed Opus' },
      { id: 'openrouter:new-model', name: 'New Model' },
    ];
    rpc.refreshAvailableModels.mockResolvedValue(refreshedModels);
    const { client } = renderModelSettings(true);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Model list refreshed'));
    expect(client.getQueryData(['chat-options', 'models'])).toEqual(refreshedModels);
    expect(
      screen.getByRole('button', { name: 'Choose model, current model is Refreshed Opus' }),
    ).toBeDefined();
  });

  it('keeps the old list and reports the refresh error', async () => {
    rpc.refreshAvailableModels.mockRejectedValue(new Error('provider failed'));
    const { client } = renderModelSettings(true);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('provider failed'));
    expect(client.getQueryData(['chat-options', 'models'])).toEqual(router.availableModels);
    expect(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.8' }),
    ).toBeDefined();
  });

  it('does not change the selected model when it disappears after refresh', async () => {
    rpc.refreshAvailableModels.mockResolvedValue([
      { id: 'openrouter:new-model', name: 'New Model' },
    ]);
    renderModelSettings(true);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(currentModelId()).toBe(INITIAL_MODEL_ID);
    expect(
      screen.getByRole('button', {
        name: `Choose model, current model is unavailable: ${INITIAL_MODEL_ID}`,
      }),
    ).toBeDefined();
  });
});
