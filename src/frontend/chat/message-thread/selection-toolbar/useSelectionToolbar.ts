import { createEffect, createSignal, onSettled, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { getSelectionContainer, getSelectionRect } from './utils';

const hiddenStyles: JSX.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  visibility: 'hidden',
};

export function useSelectionToolbar(container: Accessor<HTMLElement | undefined>) {
  const [text, setText] = createSignal('');
  const [rect, setRect] = createSignal<DOMRect>();
  const [positionedStyles, setPositionedStyles] = createSignal<JSX.CSSProperties>(hiddenStyles);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let floating: HTMLDivElement | undefined;

  const hideToolbar = () => {
    setText('');
    setRect(undefined);
    if (timeout) clearTimeout(timeout);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    hideToolbar();
  };

  onSettled(() => {
    const handleSelectionChange = () => {
      if (timeout) clearTimeout(timeout);
      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setText('');
        setRect(undefined);
        return;
      }
      timeout = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0)
          return hideToolbar();
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const selectionContainer = getSelectionContainer(range);
        const root = container();
        if (
          !selectedText ||
          !root ||
          !selectionContainer ||
          !root.contains(selectionContainer) ||
          !selectionContainer.closest("[data-role='assistant']")
        )
          return hideToolbar();
        const selectionRect = getSelectionRect(range);
        if (!selectionRect) return hideToolbar();
        setText(selectedText);
        setRect(selectionRect);
      }, 300);
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!text() || !(event.target instanceof Node)) return;
      if (event.target instanceof Element && event.target.closest('[data-selection-toolbar]'))
        return;
      if (!container()?.contains(event.target)) clearSelection();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown);
      if (timeout) clearTimeout(timeout);
    };
  });

  createEffect(
    () => rect(),
    (selectionRect) => {
      if (!selectionRect) return;
      requestAnimationFrame(() => {
        if (!floating) return;
        const pad = 8;
        const toolbarRect = floating.getBoundingClientRect();
        const top =
          selectionRect.top - toolbarRect.height - pad >= 0
            ? selectionRect.top - toolbarRect.height
            : selectionRect.bottom + toolbarRect.height + pad <= window.innerHeight
              ? selectionRect.bottom
              : selectionRect.top - toolbarRect.height;
        let left = selectionRect.left + selectionRect.width / 2 - toolbarRect.width / 2;
        if (left < pad) left = pad;
        if (left + toolbarRect.width > window.innerWidth - pad)
          left = window.innerWidth - pad - toolbarRect.width;
        setPositionedStyles({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          'z-index': 'var(--z-floating)',
          visibility: 'visible',
        });
      });
    },
  );

  return {
    text,
    hasSelection: () => Boolean(text() && rect()),
    clearSelection,
    setFloating: (element: HTMLDivElement) => {
      floating = element;
    },
    floatingStyles: () => (!rect() || !text() ? hiddenStyles : positionedStyles()),
  };
}
