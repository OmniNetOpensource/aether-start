import { fireEvent, screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { act, renderTest } from '@/test/render';
import MarkdownImpl from './MarkdownImpl';
import { ToastProvider } from '@/shared/app-shell/toast-context';

describe('MarkdownImpl', () => {
  it('renders GFM, CJK emphasis, math, and project-owned elements', () => {
    const { container } = renderTest(
      () => (
        <MarkdownImpl
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
      () => <MarkdownImpl content='正文 **未完成' isAnimating />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(container.querySelector('strong')?.textContent).toBe('未完成');

    rerender(() => <MarkdownImpl content={'```ts\nconst value = 1'} isAnimating />);

    expect(container.querySelector('[data-markdown="code-block"]')?.textContent).toContain(
      'const value = 1',
    );
  });

  it('does not turn unsafe URLs or raw HTML into executable elements', () => {
    const { container } = renderTest(
      () => <MarkdownImpl content={'[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>'} />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('keeps external-link confirmation under project control', async () => {
    renderTest(
      () => <MarkdownImpl content='[React](https://react.dev)' />,
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    await act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'React' }));
    });

    expect(screen.getByText('Open external link')).toBeDefined();
    expect(screen.getByText('https://react.dev/')).toBeDefined();
  });
});
