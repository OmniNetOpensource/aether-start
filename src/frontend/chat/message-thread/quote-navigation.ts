import { useEffect, type RefObject } from 'react';
import { isQuoteItem, type QuoteItem, type QuoteSource } from '@/shared/chat/message';
import { useToast } from '@/frontend/app-shell/useToast';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import {
  currentPath,
  messages,
  selectMessage,
} from '@/frontend/conversations/conversation-tree/message-tree-state';

function textRuns(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runs: { node: Text; text: string; offsets: number[] }[] = [];
  let node = walker.nextNode();
  while (node) {
    // 代码工具栏和公式的隐藏 MathML 不属于用户看到的正文。
    if (
      node instanceof Text &&
      !node.parentElement?.closest('header, button, .katex-mathml, [hidden]')
    ) {
      // Shiki 用 block span 分行，纯文本和流式代码则保留换行字符。
      const isCode = !!node.parentElement?.closest('pre code');
      const offsets: number[] = [];
      for (let index = 0; index < node.length; index++) {
        if (isCode && (node.data[index] === '\r' || node.data[index] === '\n')) continue;
        offsets.push(index);
      }
      const text = node.data;
      runs.push({ node, text: offsets.map((index) => text[index]).join(''), offsets });
    }
    node = walker.nextNode();
  }
  return runs;
}

export function captureQuoteSource(range: Range, conversationId: string): QuoteSource | null {
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const end =
    range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  const message = start?.closest('[data-message-id][data-role="assistant"]');
  if (!message || message !== end?.closest('[data-message-id][data-role="assistant"]')) return null;
  const ranges: QuoteSource['ranges'] = [];
  for (const block of message.querySelectorAll('[data-quote-content]')) {
    let offset = 0;
    let from: number | undefined;
    let to = 0;
    const runs = textRuns(block);
    for (const { node, text, offsets } of runs) {
      if (range.intersectsNode(node)) {
        const startOffset =
          range.startContainer === node
            ? offsets.filter((offset) => offset < range.startOffset).length
            : 0;
        const endOffset =
          range.endContainer === node
            ? offsets.filter((offset) => offset < range.endOffset).length
            : text.length;
        if (endOffset > startOffset) {
          from ??= offset + startOffset;
          to = offset + endOffset;
        }
      }
      offset += text.length;
    }
    if (from === undefined) continue;
    ranges.push({
      contentIndex: Number(block.getAttribute('data-quote-content')),
      start: from,
      end: to,
      text: runs
        .map((run) => run.text)
        .join('')
        .slice(from, to),
    });
  }
  if (ranges.length === 0) return null;
  return { conversationId, messageId: Number(message.getAttribute('data-message-id')), ranges };
}

export function resolveQuoteRanges(message: Element, source: QuoteSource): Range[] | null {
  const ranges: Range[] = [];
  for (const saved of source.ranges) {
    const block = message.querySelector(`[data-quote-content="${saved.contentIndex}"]`);
    if (!block) return null;
    const runs = textRuns(block);
    const text = runs.map((run) => run.text).join('');
    if (text.slice(saved.start, saved.end) !== saved.text) return null;
    let offset = 0;
    for (const { node, text, offsets } of runs) {
      const start = Math.max(0, saved.start - offset);
      const end = Math.min(text.length, saved.end - offset);
      if (end > start) {
        const range = document.createRange();
        range.setStart(node, offsets[start]);
        range.setEnd(node, offsets[end - 1] + 1);
        ranges.push(range);
      }
      offset += text.length;
    }
  }
  return ranges;
}

export function requestQuoteNavigation(quote: QuoteItem) {
  document.dispatchEvent(new CustomEvent('aether-quote-navigate', { detail: quote }));
}

export function useQuoteNavigation(
  container: RefObject<HTMLElement | null>,
  scope: { type: 'conversation'; id: string | null } | { type: 'share' },
) {
  const toast = useToast();
  const conversationId = scope.type === 'conversation' ? scope.id : null;
  const isShare = scope.type === 'share';

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let observer: MutationObserver | undefined;
    let target: Element | null = null;
    const clear = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      target?.removeAttribute('data-quote-target');
      target = null;
      if ('highlights' in CSS) CSS.highlights.delete('quote-source');
    };
    const navigate = (event: Event) => {
      if (!(event instanceof CustomEvent) || !isQuoteItem(event.detail)) return;
      clear();
      const source = event.detail.source;
      if (source === undefined) {
        toast.warning('这条引用未记录原文位置');
        return;
      }
      if (source === null) {
        toast.warning('引用原文未包含在这份分享中');
        return;
      }
      if (!isShare && source.conversationId !== conversationId) {
        toast.warning('引用来自其他会话，请在原会话中查看');
        return;
      }
      if (!('highlights' in CSS) || typeof Highlight === 'undefined') {
        toast.warning('当前浏览器不支持引用高亮');
        return;
      }
      if (!isShare && !currentPath().includes(source.messageId)) {
        if (
          !messages().some(
            (message) => message.id === source.messageId && message.role === 'assistant',
          )
        ) {
          toast.warning('找不到引用原文');
          return;
        }
        if (chatState.getStatus() !== 'idle') {
          toast.warning('请等待当前回答结束后再跳转到其他分支');
          return;
        }
        selectMessage(source.messageId);
      }
      frame = requestAnimationFrame(() => {
        const root = container.current;
        target =
          root?.querySelector(`[data-message-id="${source.messageId}"][data-role="assistant"]`) ??
          null;
        if (!root || !target) {
          toast.warning(isShare ? '引用原文未包含在这份分享中' : '找不到引用原文');
          return;
        }
        target.setAttribute('data-quote-target', '');
        const ranges = resolveQuoteRanges(target, source);
        if (!ranges) {
          clear();
          toast.warning('原文内容已变化，无法准确定位');
          return;
        }
        CSS.highlights.set('quote-source', new Highlight(...ranges));
        for (
          let element = ranges[0].startContainer.parentElement;
          element && element !== root;
          element = element.parentElement
        ) {
          if (
            element.scrollWidth <= element.clientWidth ||
            !['auto', 'scroll'].includes(getComputedStyle(element).overflowX)
          )
            continue;
          const rect = ranges[0].getBoundingClientRect();
          element.scrollBy({
            left:
              rect.left -
              element.getBoundingClientRect().left -
              element.clientWidth / 2 +
              Math.min(rect.width, element.clientWidth) / 2,
            behavior: 'instant',
          });
        }
        const rect = ranges[0].getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        root.scrollTo({
          top:
            root.scrollTop +
            rect.top -
            rootRect.top -
            root.clientHeight / 2 +
            Math.min(rect.height, root.clientHeight) / 2,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
        // 流式收口和代码着色会替换文本节点，使用保存的位置重新建立 Range。
        observer = new MutationObserver(() => {
          if (!target || !root.contains(target)) return clear();
          const updated = resolveQuoteRanges(target, source);
          if (!updated) return clear();
          CSS.highlights.set('quote-source', new Highlight(...updated));
        });
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        timer = setTimeout(clear, 3000);
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    document.addEventListener('aether-quote-navigate', navigate);
    document.addEventListener('keydown', escape);
    return () => {
      clear();
      document.removeEventListener('aether-quote-navigate', navigate);
      document.removeEventListener('keydown', escape);
    };
  }, [container, conversationId, isShare, toast]);
}
