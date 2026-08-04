import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichComposerEditor, type RichComposerEditorHandle } from './RichComposerEditor';

describe('RichComposerEditor', () => {
  it('keeps an empty document stable', async () => {
    render(
      <RichComposerEditor
        id='empty-editor'
        document={[]}
        onChange={() => {}}
        onSubmit={() => {}}
        placeholder='Type here'
      />,
    );

    expect(await screen.findByRole('textbox')).toBeTruthy();
    expect(screen.getByText('Type here')).toBeTruthy();
  });

  it('inserts and removes an atomic quote chip inside the text editor', async () => {
    const editor = createRef<RichComposerEditorHandle>();
    const onChange = vi.fn();

    render(
      <RichComposerEditor
        ref={editor}
        id='test-editor'
        document={[{ type: 'text', text: 'hello' }]}
        onChange={onChange}
        onSubmit={() => {}}
        placeholder='Type here'
      />,
    );

    expect((await screen.findByRole('textbox')).textContent).toContain('hello');

    act(() => editor.current?.insertQuote('quoted text'));

    expect(await screen.findByText('quoted text')).toBeTruthy();
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
