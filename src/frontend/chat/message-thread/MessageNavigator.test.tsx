import { createRef } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import {
  clearMessageTree,
  setMessages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import { MessageNavigator } from './MessageNavigator';

beforeEach(() => {
  setMessages([
    {
      id: 1,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: 2,
      role: 'user',
      blocks: [{ type: 'content', content: '第一条消息' }],
      createdAt: '2026-09-17T00:00:00.000Z',
      completedAt: null,
    },
    {
      id: 2,
      parentId: 1,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [{ type: 'content', content: '回复'.repeat(60) }],
      createdAt: '2026-09-17T00:00:01.000Z',
      completedAt: null,
    },
  ]);
});

afterEach(() => {
  clearMessageTree();
  vi.restoreAllMocks();
});

function setup(messageIds = [1, 2]) {
  const scrollElement = createRef<HTMLDivElement>();
  const view = renderTest(() => (
    <>
      <div ref={scrollElement}>
        {messageIds.map((id) => (
          <div key={id} data-message-id={id} />
        ))}
      </div>
      <MessageNavigator messageIds={messageIds} scrollElement={scrollElement} />
    </>
  ));
  const root = scrollElement.current;
  if (!root) throw new Error('Missing scroll element');
  const target = root.querySelector('[data-message-id="2"]');
  if (!target) throw new Error('Missing second message');
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 600, 600));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 700, 600, 800));
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  return { ...view, root, target };
}

describe('MessageNavigator', () => {
  it('scrolls the message container to the actual target with the agreed inset', () => {
    const { root } = setup();
    root.scrollTop = 200;
    const scroll = vi.spyOn(root, 'scrollTo').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '跳转到第 2 条消息' }));
    expect(scroll).toHaveBeenCalledWith({ top: 776, behavior: 'smooth' });
  });

  it('respects reduced motion', () => {
    const { root } = setup();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const result = new EventTarget();
      return Object.assign(result, {
        media: query,
        matches: true,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
      });
    });
    const scroll = vi.spyOn(root, 'scrollTo').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '跳转到第 2 条消息' }));
    expect(scroll).toHaveBeenCalledWith({ top: 576, behavior: 'instant' });
  });

  it('previews on hover and keyboard focus, truncates text, and dismisses on Escape', () => {
    setup();
    const button = screen.getByRole('button', { name: '跳转到第 2 条消息' });
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip').textContent).toBe(`助手${'回复'.repeat(40)}…`);
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('tracks the reading position without moving the chat viewport', async () => {
    const { root, target } = setup();
    const scroll = vi.spyOn(root, 'scrollTo');
    const first = screen.getByRole('button', { name: '跳转到第 1 条消息' });
    const second = screen.getByRole('button', { name: '跳转到第 2 条消息' });
    await waitFor(() => expect(first.getAttribute('aria-current')).toBe('location'));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 250, 600, 800));
    await act(() => fireEvent.scroll(root));
    await waitFor(() => expect(second.getAttribute('aria-current')).toBe('location'));
    expect(first.hasAttribute('aria-current')).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('only exposes messages in the supplied branch', () => {
    setup([2]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByRole('tooltip').textContent).toContain('助手');
  });
});
