import { screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { renderTest } from '@/test/render';
import Markdown from './Markdown';
import { ToastProvider } from '@/frontend/app-shell/toast-context';

describe('Markdown', () => {
  it('renders GFM, CJK emphasis, math, and project-owned elements', () => {
    const { container } = renderTest(
      () => (
        <Markdown
          content={'# 标题\n\n中文**加粗**中文\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$E=mc^2$'}
        />
      ),
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(container.querySelector('h1')?.textContent).toBe('标题');
    expect(container.querySelector('strong')?.textContent).toBe('加粗');
    expect(container.querySelector('table')?.textContent).toContain('A');
    expect(container.querySelector('[data-markdown="table-container"]')).not.toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('repairs incomplete streaming markdown before parsing', () => {
    const { container, rerender } = renderTest(
      () => <Markdown content='正文 **未完成' isAnimating />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(container.querySelector('strong')?.textContent).toBe('未完成');

    rerender(() => <Markdown content={'```ts\nconst value = 1'} isAnimating />);

    expect(container.querySelector('[data-markdown="code-block"]')?.textContent).toContain(
      'const value = 1',
    );
  });

  it('keeps existing stream DOM and fades in only appended text', () => {
    const [content, setContent] = createSignal('你好');
    const { container } = renderTest(
      () => <Markdown content={content()} isAnimating />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    const paragraph = container.querySelector('p');
    const firstSpan = paragraph?.querySelector('.animate-fresh-token');
    expect(firstSpan?.textContent).toBe('你好');

    setContent('你好,世界');
    flush();

    expect(container.querySelector('p')).toBe(paragraph);
    const spans = [...container.querySelectorAll('.animate-fresh-token')];
    expect(spans[0]).toBe(firstSpan);
    expect(spans[1]?.textContent).toBe(',世界');
  });

  it('keeps completed paragraph DOM while the last paragraph streams', () => {
    const [content, setContent] = createSignal('第一段\n\n第二段');
    const { container } = renderTest(
      () => <Markdown content={content()} isAnimating />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    const completedParagraph = container.querySelectorAll('p')[0];

    setContent('第一段\n\n第二段继续增长');
    flush();

    expect(container.querySelectorAll('p')[0]).toBe(completedParagraph);
  });

  it('does not turn unsafe URLs or raw HTML into executable elements', () => {
    const { container } = renderTest(
      () => <Markdown content={'[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>'} />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('opens external links in a new tab', () => {
    renderTest(
      () => <Markdown content='[React](https://react.dev)' />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    const link = screen.getByRole('link', { name: 'React' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
