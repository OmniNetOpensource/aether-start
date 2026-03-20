/**
 * 选区工具栏 - 选区检测与定位 Hook
 *
 * 负责：
 * 1. 监听 selectionchange 检测用户选区（250ms 防抖，避免拖动过程中频繁触发）
 * 2. 校验选区是否在消息区域内（仅对 assistant 消息生效）
 * 3. 点击工具栏外时清除选区
 * 4. 根据选区矩形计算浮动工具栏的 top/left，优先选上方、水平居中、不超出视口
 */

import { useState, useRef, useEffect } from "react";
import type { RefObject } from "react";
import { getSelectionContainer, getSelectionRect } from "./utils";

/** 工具栏隐藏时的占位样式，用于先渲染再测量尺寸 */
const hiddenStyles: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  visibility: "hidden",
};

export function useSelectionToolbar(
  containerRef: RefObject<HTMLElement | null>,
) {
  const [text, setText] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [positionedStyles, setPositionedStyles] =
    useState<React.CSSProperties>(hiddenStyles);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);

  const hasSelection = Boolean(text && rect);

  /** 清除当前选区并重置状态，供引用按钮等操作后调用 */
  const clearSelection = () => {
    if (typeof window !== "undefined") {
      const current = window.getSelection();
      if (current) current.removeAllRanges();
    }
    setText("");
    setRect(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  // selectionchange：选区为空立即清除；选区有内容则 250ms 防抖后校验并显示（避免拖动过程中频繁触发）
  useEffect(() => {
    const handleSelectionChange = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typeof window === "undefined") return;

      const current = window.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setText("");
        setRect(null);
        return;
      }

      timeoutRef.current = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setText("");
          setRect(null);
          return;
        }

        const selectedText = sel.toString().trim();
        if (!selectedText) {
          setText("");
          setRect(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const container = getSelectionContainer(range);
        const root = containerRef.current;

        if (!root || !container || !root.contains(container)) {
          setText("");
          setRect(null);
          return;
        }

        const messageElement = container.closest("[data-role='assistant']");
        if (!messageElement) {
          setText("");
          setRect(null);
          return;
        }

        const selRect = getSelectionRect(range);
        if (!selRect) {
          setText("");
          setRect(null);
          return;
        }

        setText(selectedText);
        setRect(selRect);
      }, 300);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [containerRef]);

  // 有选区时，点击工具栏外（且不在容器内）则清除选区
  useEffect(() => {
    if (!text) return;

    const clearSelectionFromEffect = () => {
      if (typeof window !== "undefined") {
        const current = window.getSelection();
        if (current) current.removeAllRanges();
      }
      setText("");
      setRect(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-selection-toolbar]")
      )
        return;
      const root = containerRef.current;
      if (!root) {
        clearSelectionFromEffect();
        return;
      }
      if (event.target instanceof Node && root.contains(event.target)) return;
      clearSelectionFromEffect();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [text, containerRef]);

  // 根据选区矩形计算工具栏位置：优先选上方，水平居中，限制在视口内
  useEffect(() => {
    if (!rect || !hasSelection) return;

    const raf = requestAnimationFrame(() => {
      const el = floatingRef.current;
      if (!el) return;

      const pad = 8;
      const elRect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 优先选上方；上方空间不足则选下方；都不足时仍选上方（可能略微超出）
      let top: number;
      if (rect.top - elRect.height - pad >= 0) {
        top = rect.top - elRect.height;
      } else if (rect.bottom + elRect.height + pad <= vh) {
        top = rect.bottom;
      } else {
        top = rect.top - elRect.height;
      }

      // 水平居中于选区，再限制在视口内
      let left = rect.left + rect.width / 2 - elRect.width / 2;
      if (left < pad) left = pad;
      if (left + elRect.width > vw - pad) left = vw - pad - elRect.width;

      setPositionedStyles({
        position: "fixed",
        top,
        left,
        zIndex: "var(--z-floating)",
        visibility: "visible",
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [rect, hasSelection]);

  const floatingStyles =
    !rect || !hasSelection ? hiddenStyles : positionedStyles;

  return { text, hasSelection, clearSelection, floatingRef, floatingStyles };
}
