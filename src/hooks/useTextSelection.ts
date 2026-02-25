import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

export type TextSelectionState = {
  text: string;
  range: Range | null;
  rect: DOMRect | null;
};

const emptySelection: TextSelectionState = {
  text: "",
  range: null,
  rect: null,
};

const getSelectionContainer = (range: Range) => {
  const node = range.commonAncestorContainer;
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }
  return node.parentElement;
};

const getSelectionRect = (range: Range) => {
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) {
    return rect;
  }
  const rects = range.getClientRects();
  return rects.length > 0 ? rects[0] : null;
};

export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelectionState>(emptySelection);

  const clearSelection = useCallback(() => {
    if (typeof window !== "undefined") {
      const current = window.getSelection();
      if (current) {
        current.removeAllRanges();
      }
    }
    setSelection(emptySelection);
  }, []);

  const updateSelection = () => {
    if (typeof window === "undefined") {
      return;
    }

    const current = window.getSelection();
    if (!current || current.isCollapsed || current.rangeCount === 0) {
      setSelection(emptySelection);
      return;
    }

    const text = current.toString().trim();
    if (!text) {
      setSelection(emptySelection);
      return;
    }

    const range = current.getRangeAt(0);
    const container = getSelectionContainer(range);
    const root = containerRef.current;
    if (!root || !container || !root.contains(container)) {
      setSelection(emptySelection);
      return;
    }

    const rect = getSelectionRect(range);
    if (!rect) {
      setSelection(emptySelection);
      return;
    }

    setSelection({ text, range, rect });
  };

  useEffect(() => {
    if (!selection.text) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const root = containerRef.current;
      if (event.target instanceof Element) {
        if (event.target.closest("[data-selection-quote-button]")) {
          return;
        }
      }
      if (!root) {
        clearSelection();
        return;
      }
      if (event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      clearSelection();
    };

    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [selection.text, containerRef, clearSelection]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (typeof window === "undefined") {
        return;
      }
      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setSelection(emptySelection);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  return { selection, updateSelection, clearSelection };
}
