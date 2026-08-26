import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { act, renderTest } from '@/test/render';
import { RichComposerEditor, type RichComposerEditorHandle } from './RichComposerEditor';
import { ToastProvider } from '@/frontend/app-shell/toast-context';

describe('RichComposerEditor', () => {
  it('keeps an empty document stable', async () => {
    renderTest(
      () => (
        <RichComposerEditor
          id='empty-editor'
          document={[]}
          onChange={() => {}}
          onSubmit={() => {}}
          ariaLabel='Message input'
        />
      ),
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect(await screen.findByRole('textbox', { name: 'Message input' })).toBeTruthy();
  });

  it('focuses and blurs without moving the surrounding scroll position', async () => {
    let editor: RichComposerEditorHandle | null = null;

    renderTest(
      () => (
        <div data-testid='scroll-container'>
          <RichComposerEditor
            ref={(currentEditor) => {
              editor = currentEditor;
            }}
            id='focus-editor'
            document={[]}
            onChange={() => {}}
            onSubmit={() => {}}
            ariaLabel='Message input'
          />
        </div>
      ),
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    const textbox = await screen.findByRole('textbox', { name: 'Message input' });
    const scrollContainer = screen.getByTestId('scroll-container');
    scrollContainer.scrollTop = 240;

    await act(() => editor?.focus());

    await waitFor(() => expect(document.activeElement).toBe(textbox));
    expect(scrollContainer.scrollTop).toBe(240);

    await act(() => editor?.blur());

    await waitFor(() => expect(document.activeElement).not.toBe(textbox));
    expect(scrollContainer.scrollTop).toBe(240);
  });

  it('inserts and removes an atomic quote chip inside the text editor', async () => {
    let editor: RichComposerEditorHandle | null = null;
    const onChange = vi.fn();

    renderTest(
      () => (
        <RichComposerEditor
          ref={(currentEditor) => {
            editor = currentEditor;
          }}
          id='test-editor'
          document={[{ type: 'text', text: 'hello' }]}
          onChange={onChange}
          onSubmit={() => {}}
          ariaLabel='Message input'
        />
      ),
      (children) => <ToastProvider>{children()}</ToastProvider>,
    );

    expect((await screen.findByRole('textbox')).textContent).toContain('hello');

    await act(() => editor?.insertQuote('quoted text'));

    const quote = await screen.findByText('quoted text');
    expect(quote.parentElement?.parentElement?.classList.contains('max-w-64')).toBe(true);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          { type: 'quote', quote: { id: expect.any(String), text: 'quoted text' } },
        ]),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '删除引用' }));

    await waitFor(() => expect(screen.queryByText('quoted text')).toBeNull());
  });
});
