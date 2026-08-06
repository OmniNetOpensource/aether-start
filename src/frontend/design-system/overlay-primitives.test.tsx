import { fireEvent, screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { act, renderTest } from '@/test/render';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('overlay primitives', () => {
  it('exposes menu semantics, keyboard navigation, and closes after selection', async () => {
    renderTest(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    await act(() => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBe(document.activeElement);

    await act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
    });
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' });
    expect(deleteItem).toBe(document.activeElement);

    await act(() => {
      fireEvent.click(deleteItem);
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('links dialog labels, closes on Escape, and restores trigger focus', async () => {
    renderTest(() => (
      <Dialog>
        <DialogTrigger>Open settings</DialogTrigger>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Change your preferences</DialogDescription>
          <button type='button'>Save</button>
        </DialogContent>
      </Dialog>
    ));

    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await act(() => {
      fireEvent.click(trigger);
    });

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.getAttribute('aria-describedby')).toBe(
      screen.getByText('Change your preferences').id,
    );

    await act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });
});
