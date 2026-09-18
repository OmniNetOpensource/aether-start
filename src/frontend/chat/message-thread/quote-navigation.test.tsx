import { useRef } from 'react';
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { ToastProvider } from '@/frontend/app-shell/toast-context';
import type { QuoteSource } from '@/shared/chat/message';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import {
  clearMessageTree,
  currentPath,
  initializeMessageTree,
  useCurrentPath,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import {
  captureQuoteSource,
  requestQuoteNavigation,
  resolveQuoteRanges,
  useQuoteNavigation,
} from './quote-navigation';

afterEach(() => {
  clearMessageTree();
  chatState.setStatus('idle');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('quote text positions', () => {
  it('keeps multiline code positions stable before and after Shiki removes newline text nodes', () => {
    const message = document.createElement('article');
    message.dataset.messageId = '2';
    message.dataset.role = 'assistant';
    message.innerHTML =
      '<div data-quote-content="0"><pre><code>const value = 1;\nreturn value;</code></pre></div>';
    const code = message.querySelector('code')?.firstChild;
    if (!code?.textContent) throw new Error('Missing code');
    const range = document.createRange();
    range.setStart(code, code.textContent.indexOf('return'));
    range.setEnd(code, code.textContent.length - 1);
    const source = captureQuoteSource(range, 'conversation');
    if (!source) throw new Error('Missing source');
    message.innerHTML =
      '<div data-quote-content="0"><pre><code><span>const value = 1;</span><span><span>return</span> value;</span></code></pre></div>';
    const highlighted = resolveQuoteRanges(message, source);
    expect(highlighted?.map((item) => item.toString()).join('')).toBe('return value');
    const secondLine = message.querySelector('code > span:last-child');
    if (!secondLine) throw new Error('Missing line');
    range.selectNodeContents(secondLine);
    const savedAfterHighlighting = captureQuoteSource(range, 'conversation');
    if (!savedAfterHighlighting) throw new Error('Missing source');
    message.innerHTML =
      '<div data-quote-content="0"><pre><code>const value = 1;\nreturn value;</code></pre></div>';
    expect(
      resolveQuoteRanges(message, savedAfterHighlighting)
        ?.map((item) => item.toString())
        .join(''),
    ).toBe('return value;');
  });

  it('restores the selected occurrence across formatting and text-node replacements', () => {
    const message = document.createElement('article');
    message.dataset.messageId = '2';
    message.dataset.role = 'assistant';
    message.innerHTML =
      '<div data-quote-content="0"><p>相同文字，<strong>相同文字</strong>。</p><p>下一段</p></div>';
    const selected = message.querySelector('strong')?.firstChild;
    const end = message.querySelector('p:last-child')?.firstChild;
    if (!selected || !end) throw new Error('Missing text');
    const range = document.createRange();
    range.setStart(selected, 0);
    range.setEnd(end, 2);
    const source = captureQuoteSource(range, 'conversation');
    expect(source?.ranges).toEqual([
      { contentIndex: 0, start: 5, end: 12, text: '相同文字。下一' },
    ]);
    if (!source) throw new Error('Missing source');
    message.innerHTML =
      '<div data-quote-content="0"><p>相同文字，<strong><span>相同</span><span>文字</span></strong>。</p><p>下一段</p></div>';
    const restored = resolveQuoteRanges(message, source);
    expect(restored?.map((item) => item.toString()).join('')).toBe('相同文字。下一');
    expect(restored?.[0].startContainer.parentElement?.closest('strong')).not.toBeNull();
    message.querySelector('strong')?.replaceChildren('内容变了');
    expect(resolveQuoteRanges(message, source)).toBeNull();
  });

  it('excludes code controls and research text while preserving ranges across content blocks', () => {
    const message = document.createElement('article');
    message.dataset.messageId = '4';
    message.dataset.role = 'assistant';
    message.innerHTML =
      '<div data-quote-content="0"><section><header>js<button>Copy</button></header><pre><code>const x = 1;</code></pre></section></div><p>思考过程</p><div data-quote-content="1"><table><tbody><tr><td>结果</td></tr></tbody></table></div>';
    const code = message.querySelector('code')?.firstChild;
    const cell = message.querySelector('td')?.firstChild;
    if (!code || !cell) throw new Error('Missing text');
    const range = document.createRange();
    range.setStart(code, 6);
    range.setEnd(cell, 2);
    const source = captureQuoteSource(range, 'conversation');
    expect(source?.ranges).toEqual([
      { contentIndex: 0, start: 6, end: 12, text: 'x = 1;' },
      { contentIndex: 1, start: 0, end: 2, text: '结果' },
    ]);
    if (!source) throw new Error('Missing source');
    message.querySelector('header')?.append(' copied!');
    expect(resolveQuoteRanges(message, source)?.map((item) => item.toString())).toEqual([
      'x = 1;',
      '结果',
    ]);
  });

  it('does not create a source for a selection spanning different messages', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<article data-message-id="2" data-role="assistant"><p data-quote-content="0">first</p></article><article data-message-id="4" data-role="assistant"><p data-quote-content="0">last</p></article>';
    const range = document.createRange();
    const start = root.querySelector('p')?.firstChild;
    const end = root.querySelector('article:last-child p')?.firstChild;
    if (!start || !end) throw new Error('Missing text');
    range.setStart(start, 0);
    range.setEnd(end, 4);
    expect(captureQuoteSource(range, 'conversation')).toBeNull();
  });
});

function SharedThread() {
  const container = useRef<HTMLElement>(null);
  useQuoteNavigation(container, { type: 'share' });
  return (
    <main ref={container}>
      <article data-message-id='2' data-role='assistant'>
        <p data-quote-content='0'>原文内容</p>
      </article>
    </main>
  );
}

function PrivateThread({ id }: { id: string }) {
  const container = useRef<HTMLElement>(null);
  const path = useCurrentPath();
  useQuoteNavigation(container, { type: 'conversation', id });
  return (
    <main ref={container}>
      {path.map((messageId) => (
        <article key={messageId} data-message-id={messageId} data-role='assistant'>
          <p data-quote-content='0'>原文内容</p>
        </article>
      ))}
    </main>
  );
}

describe('quote navigation lifecycle', () => {
  it('switches to the source branch only while idle and clears highlights on a conversation change', async () => {
    vi.useFakeTimers();
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { ...CSS, highlights });
    vi.stubGlobal(
      'Highlight',
      class extends Set<Range> {
        constructor(...ranges: Range[]) {
          super(ranges);
        }
      },
    );
    initializeMessageTree(
      [
        {
          id: 1,
          role: 'user',
          parentId: null,
          latestChild: 2,
          prevSibling: null,
          nextSibling: null,
          createdAt: '',
          completedAt: null,
          blocks: [],
        },
        {
          id: 2,
          role: 'assistant',
          parentId: 1,
          latestChild: null,
          prevSibling: null,
          nextSibling: 3,
          createdAt: '',
          completedAt: null,
          blocks: [],
        },
        {
          id: 3,
          role: 'assistant',
          parentId: 1,
          latestChild: null,
          prevSibling: 2,
          nextSibling: null,
          createdAt: '',
          completedAt: null,
          blocks: [],
        },
      ],
      [1, 2],
    );
    const view = renderTest(() => (
      <ToastProvider>
        <PrivateThread id='original' />
      </ToastProvider>
    ));
    const quote = {
      id: 'quote',
      text: '文内',
      source: {
        conversationId: 'original',
        messageId: 3,
        ranges: [{ contentIndex: 0, start: 1, end: 3, text: '文内' }],
      },
    };
    act(() => {
      chatState.setStatus('streaming');
      requestQuoteNavigation(quote);
    });
    expect(currentPath()).toEqual([1, 2]);
    expect(screen.getByText('请等待当前回答结束后再跳转到其他分支')).toBeTruthy();
    act(() => {
      chatState.setStatus('idle');
      requestQuoteNavigation(quote);
    });
    await act(() => vi.advanceTimersByTimeAsync(30));
    expect(currentPath()).toEqual([1, 3]);
    expect(
      view.container.querySelector('[data-quote-target]')?.getAttribute('data-message-id'),
    ).toBe('3');
    expect(highlights.has('quote-source')).toBe(true);
    view.rerender(() => (
      <ToastProvider>
        <PrivateThread id='different' />
      </ToastProvider>
    ));
    expect(highlights.has('quote-source')).toBe(false);
    act(() => requestQuoteNavigation(quote));
    expect(screen.getByText('引用来自其他会话，请在原会话中查看')).toBeTruthy();
    expect(highlights.has('quote-source')).toBe(false);
  });

  it('highlights exact text, replaces its ranges after a render, and clears after three seconds', async () => {
    vi.useFakeTimers();
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { ...CSS, highlights });
    vi.stubGlobal(
      'Highlight',
      class extends Set<Range> {
        constructor(...ranges: Range[]) {
          super(ranges);
        }
      },
    );
    const view = renderTest(() => (
      <ToastProvider>
        <SharedThread />
      </ToastProvider>
    ));
    const source: QuoteSource = {
      conversationId: null,
      messageId: 2,
      ranges: [{ contentIndex: 0, start: 1, end: 3, text: '文内' }],
    };
    act(() => requestQuoteNavigation({ id: 'quote', text: '文内', source }));
    await act(() => vi.advanceTimersByTimeAsync(30));
    expect(Array.from(highlights.get('quote-source') ?? [], (range) => range.toString())).toEqual([
      '文内',
    ]);
    expect(window.getSelection()?.toString()).toBe('');
    const paragraph = screen.getByText('原文内容');
    await act(async () => {
      paragraph.innerHTML = '原<strong>文内</strong>容';
      await Promise.resolve();
    });
    expect(Array.from(highlights.get('quote-source') ?? [], (range) => range.toString())).toEqual([
      '文内',
    ]);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(highlights.has('quote-source')).toBe(false);
    expect(view.container.querySelector('[data-quote-target]')).toBeNull();
  });

  it('explains old and unavailable sources without navigating', () => {
    renderTest(() => (
      <ToastProvider>
        <SharedThread />
      </ToastProvider>
    ));
    act(() => requestQuoteNavigation({ id: 'old', text: 'old' }));
    expect(screen.getByText('这条引用未记录原文位置')).toBeTruthy();
    act(() => requestQuoteNavigation({ id: 'outside', text: 'outside', source: null }));
    expect(screen.getByText('引用原文未包含在这份分享中')).toBeTruthy();
  });
});
