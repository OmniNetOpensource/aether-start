/**
 * 选区工具栏 - DOM 工具函数
 *
 * 提供与 Selection API 相关的纯函数，用于获取选区的容器元素和视觉矩形。
 */

/**
 * 获取选区所在的 DOM 容器元素。
 * Range.commonAncestorContainer 可能是文本节点或元素节点：
 * - 若是元素节点，直接返回
 * - 若是文本节点，返回其父元素
 */
export function getSelectionContainer(range: Range) {
  const node = range.commonAncestorContainer;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/**
 * 获取选区在视口中的矩形区域（用于定位浮动工具栏）。
 * 优先使用 getBoundingClientRect，若无效则回退到 getClientRects 的第一项。
 * 返回 null 表示无法获取有效矩形（例如选区为空或跨多行异常）。
 */
export function getSelectionRect(range: Range) {
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) return rect;
  const rects = range.getClientRects();
  return rects.length > 0 ? rects[0] : null;
}
