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
