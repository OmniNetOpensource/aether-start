import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getSelectionContainer, getSelectionRect } from './utils';

const hiddenStyles: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  visibility: 'hidden',
};

export function useSelectionToolbar(container: () => HTMLElement | null) {
  const [text, setText] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [positionedStyles, setPositionedStyles] = useState<CSSProperties>(hiddenStyles);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const floating = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);
  const containerRef = useRef(container);
  textRef.current = text;
  containerRef.current = container;

  const hideToolbar = () => {
    setText('');
    setRect(null);
    if (timeout.current) clearTimeout(timeout.current);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    hideToolbar();
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      if (timeout.current) clearTimeout(timeout.current);
      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setText('');
        setRect(null);
        return;
      }
      timeout.current = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return hideToolbar();
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const selectionContainer = getSelectionContainer(range);
        const root = containerRef.current();
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
      if (!textRef.current || !(event.target instanceof Node)) return;
      if (event.target instanceof Element && event.target.closest('[data-selection-toolbar]'))
        return;
      if (!containerRef.current()?.contains(event.target)) clearSelection();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  useEffect(() => {
    if (!rect) return;
    const frame = requestAnimationFrame(() => {
      if (!floating.current) return;
      const pad = 8;
      const toolbarRect = floating.current.getBoundingClientRect();
      const top =
        rect.top - toolbarRect.height - pad >= 0
          ? rect.top - toolbarRect.height
          : rect.bottom + toolbarRect.height + pad <= window.innerHeight
            ? rect.bottom
            : rect.top - toolbarRect.height;
      let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
      if (left < pad) left = pad;
      if (left + toolbarRect.width > window.innerWidth - pad)
        left = window.innerWidth - pad - toolbarRect.width;
      setPositionedStyles({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 'var(--z-floating)',
        visibility: 'visible',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [rect]);

  return {
    text,
    hasSelection: Boolean(text && rect),
    clearSelection,
    setFloating: (element: HTMLDivElement | null) => {
      floating.current = element;
    },
    floatingStyles: !rect || !text ? hiddenStyles : positionedStyles,
  };
}
