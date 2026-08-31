import { StrictMode } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { ConversationItem } from './ConversationItem';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => async () => {},
}));

vi.mock('@/frontend/conversations/session', () => ({
  useDeleteConversation: () => ({ mutate: () => {} }),
  useSetConversationPinned: () => ({ mutate: () => {} }),
}));

const conversation = {
  id: 'conversation-1',
  title: 'Conversation',
  is_pinned: false,
  pinned_at: null,
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

describe('ConversationItem', () => {
  it('only reports an unmount when its menu is open', () => {
    const firstOnOpenChange = vi.fn();
    const secondOnOpenChange = vi.fn();
    const view = renderTest(() => (
      <StrictMode>
        <ConversationItem
          conversation={conversation}
          isActive={false}
          onDropdownOpenChange={firstOnOpenChange}
        />
      </StrictMode>
    ));

    expect(firstOnOpenChange).not.toHaveBeenCalled();

    view.rerender(() => (
      <StrictMode>
        <ConversationItem
          conversation={conversation}
          isActive={false}
          onDropdownOpenChange={secondOnOpenChange}
        />
      </StrictMode>
    ));

    expect(firstOnOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Conversation actions' }));

    expect(secondOnOpenChange).toHaveBeenCalledOnce();
    expect(secondOnOpenChange).toHaveBeenCalledWith(true);

    view.unmount();

    expect(secondOnOpenChange).toHaveBeenCalledTimes(2);
    expect(secondOnOpenChange).toHaveBeenLastCalledWith(false);
  });
});
