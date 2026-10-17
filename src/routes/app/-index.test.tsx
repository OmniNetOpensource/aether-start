import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderTest } from '@/test/render';
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import { DEFAULT_MODEL_ID } from '@/shared/chat/model-catalog';

vi.mock('@/frontend/chat/message-thread/NewChatGreeting', () => ({ NewChatGreeting: () => null }));
vi.mock('@/frontend/chat/message-thread/MessageList', () => ({ MessageList: () => null }));
vi.mock('@/rpc/user-preferences', () => ({ getUserPreferencesFn: vi.fn() }));
import { Route } from './index';

afterEach(() => {
  vi.restoreAllMocks();
  setCurrentModelId(DEFAULT_MODEL_ID);
});

describe('new conversation model preference', () => {
  it.each([null, 'ikun:gpt-5.4', 'retired:model'])(
    'restores preference %s on a new chat',
    (preferredModelId) => {
      setCurrentModelId('history-model');
      vi.spyOn(Route, 'useLoaderData').mockReturnValue({ preferredModelId });
      const NewChatPage = Route.options.component;
      if (!NewChatPage) throw new Error('New chat route has no component');
      const view = renderTest(() => <NewChatPage />);
      expect(currentModelId()).toBe(preferredModelId ?? DEFAULT_MODEL_ID);
      act(() => setCurrentModelId('ikun:another-manual-selection'));
      view.rerender(() => <NewChatPage />);
      expect(currentModelId()).toBe('ikun:another-manual-selection');
    },
  );
});
