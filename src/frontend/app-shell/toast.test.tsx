import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { ToastProvider, useToast } from './toast-context';

afterEach(() => vi.useRealTimers());

describe('Toast', () => {
  it('stops intercepting clicks while exiting and is removed after the exit duration', async () => {
    vi.useFakeTimers();

    const Trigger = () => {
      const toast = useToast();
      return <button onClick={() => toast.info('重新连接中...')}>Show toast</button>;
    };

    renderTest(() => (
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      screen
        .getByText('重新连接中...')
        .parentElement?.parentElement?.classList.contains('pointer-events-none'),
    ).toBe(true);

    await act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('重新连接中...')).toBeNull();
  });
});
