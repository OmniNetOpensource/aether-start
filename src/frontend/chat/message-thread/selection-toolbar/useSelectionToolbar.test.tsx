import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { useSelectionToolbar } from './useSelectionToolbar';

vi.mock('./utils', () => ({
  getSelectionContainer: (range: Range) => {
    const node = range.commonAncestorContainer;
    return node instanceof Element ? node : node.parentElement;
  },
  getSelectionRect: () => new DOMRect(20, 20, 40, 16),
}));

function SelectionState(props: { container: () => HTMLElement | null }) {
  const toolbar = useSelectionToolbar(props.container);
  return <output>{toolbar.hasSelection ? 'visible' : 'hidden'}</output>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.getSelection()?.removeAllRanges();
});

describe('useSelectionToolbar', () => {
  it('keeps a pending selection when its container accessor changes identity', () => {
    const container = document.createElement('div');
    const message = document.createElement('p');
    const text = document.createTextNode('selected text');
    message.dataset.role = 'assistant';
    message.appendChild(text);
    container.appendChild(message);
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    if (!selection) throw new Error('Selection API is unavailable');
    selection.addRange(range);

    const view = renderTest(() => <SelectionState container={() => container} />);

    act(() => document.dispatchEvent(new Event('selectionchange')));
    act(() => vi.advanceTimersByTime(100));
    view.rerender(() => <SelectionState container={() => container} />);
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText('visible')).toBeTruthy();
    container.remove();
  });
});
