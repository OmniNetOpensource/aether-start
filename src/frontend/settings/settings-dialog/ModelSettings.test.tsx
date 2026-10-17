import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import {
  clearConversationMeta,
  setConversationId,
} from '@/frontend/conversations/session/conversation-meta';
import { ModelSettings } from './ModelSettings';

const INITIAL_MODEL_ID = 'claudeOpus46Ikun';
const router = vi.hoisted(() => ({
  availableModels: [
    { id: 'claudeOpus46Ikun', name: 'Opus 4.6' },
    { id: 'ikun:gpt-5.4', name: 'GPT 5.4' },
    { id: 'ikun:gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ],
}));
const rpc = vi.hoisted(() => ({
  refreshAvailableModels: vi.fn(),
  savePreferredModel: vi.fn(),
}));
vi.mock('@/rpc/user-preferences', () => ({ savePreferredModelFn: rpc.savePreferredModel }));
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
  clearConversationMeta();
  setCurrentModelId(INITIAL_MODEL_ID);
  rpc.refreshAvailableModels.mockReset();
  rpc.savePreferredModel.mockReset().mockResolvedValue(undefined);
  toast.error.mockReset();
  toast.success.mockReset();
});

describe('ModelSettings', () => {
  it('does not overwrite a history model when a save finishes after closing settings', async () => {
    let finishSaving: () => void = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      finishSaving = resolve;
    });
    rpc.savePreferredModel.mockReturnValue(pendingSave);
    const view = renderModelSettings();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));
    view.unmount();
    setConversationId('history-conversation');
    setCurrentModelId('history-model');
    await act(async () => {
      finishSaving();
      await pendingSave;
    });
    expect(currentModelId()).toBe('history-model');
    view.client.clear();
    clearConversationMeta();
  });

  it('keeps the current model until saving succeeds and prevents duplicate saves', async () => {
    let finishSaving: () => void = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      finishSaving = resolve;
    });
    rpc.savePreferredModel.mockReturnValue(pendingSave);
    renderModelSettings();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));
    expect(currentModelId()).toBe(INITIAL_MODEL_ID);
    expect(screen.getByRole('status').textContent).toBe('Saving model preference...');
    expect(screen.getByRole('button', { name: 'Gemini 2.5 Pro' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Gemini 2.5 Pro' }));
    expect(rpc.savePreferredModel).toHaveBeenCalledOnce();
    await act(async () => {
      finishSaving();
      await pendingSave;
    });
    expect(currentModelId()).toBe('ikun:gpt-5.4');
  });

  it('reports save failures without changing the current model', async () => {
    rpc.savePreferredModel.mockRejectedValue(new Error('Preference write failed'));
    renderModelSettings();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Preference write failed'));
    expect(currentModelId()).toBe(INITIAL_MODEL_ID);
    expect(screen.getByRole('button', { name: 'GPT 5.4' })).toHaveProperty('disabled', false);
  });

  it('starts with Opus 4.6 selected', async () => {
    vi.resetModules();
    const selection = await import('@/frontend/conversations/session/chat-selection');

    expect(selection.currentModelId()).toBe(INITIAL_MODEL_ID);
  });

  it('shows the current model and saves a filtered model selection', async () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    expect(screen.getByText(INITIAL_MODEL_ID)).toBeDefined();

    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'GPT 5.4' } });

    expect(screen.queryByRole('button', { name: 'Opus 4.6' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gemini 2.5 Pro' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));

    await waitFor(() => expect(currentModelId()).toBe('ikun:gpt-5.4'));
    expect(rpc.savePreferredModel).toHaveBeenCalledWith({
      data: { preferredModelId: 'ikun:gpt-5.4' },
    });
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

  it('selects the highlighted search result with Enter', async () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'ikun:gemini' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => expect(currentModelId()).toBe('ikun:gemini-2.5-pro'));
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
  });

  it('moves through the unfiltered model list with arrow keys', async () => {
    renderModelSettings();

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => expect(currentModelId()).toBe('ikun:gpt-5.4'));
    expect(trigger).toBe(document.activeElement);
  });

  it('leaves Home and End available for editing the search text', () => {
    renderModelSettings();

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
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
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
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
