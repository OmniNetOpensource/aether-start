import { describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { renderTest } from '@/test/render';
import { ProfileMenu } from './ProfileMenu';

vi.mock('@/frontend/auth/client', () => ({
  useAuthSession: () => ({
    data: { user: { name: 'Tester', email: 'tester@example.com' } },
  }),
}));

describe('ProfileMenu', () => {
  it('does not report a dropdown change during lifecycle replay, rerender, or unmount', () => {
    const firstOnOpenChange = vi.fn();
    const secondOnOpenChange = vi.fn();
    const view = renderTest(() => (
      <StrictMode>
        <ProfileMenu onDropdownOpenChange={firstOnOpenChange} />
      </StrictMode>
    ));

    expect(firstOnOpenChange).not.toHaveBeenCalled();

    view.rerender(() => (
      <StrictMode>
        <ProfileMenu onDropdownOpenChange={secondOnOpenChange} />
      </StrictMode>
    ));

    expect(firstOnOpenChange).not.toHaveBeenCalled();

    view.unmount();

    expect(secondOnOpenChange).not.toHaveBeenCalled();
  });
});
