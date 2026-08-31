import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderTest } from '@/test/render';
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader } from './chain-of-thought';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './popover';

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
          <DialogDescription
            asChild={(descriptionProps) => (
              <a {...descriptionProps} href='/preferences'>
                Change your preferences
              </a>
            )}
          />
          <button type='button'>Save</button>
        </DialogContent>
      </Dialog>
    ));

    const trigger = screen.getByRole('button', { name: 'Open settings' });
    await act(() => {
      fireEvent.click(trigger);
    });

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const description = screen.getByRole('link', { name: 'Change your preferences' });
    expect(description.dataset.slot).toBe('dialog-description');
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id);

    await act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('dismisses an outside pointer without taking focus from its target', async () => {
    renderTest(() => (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Rename</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input aria-label='Outside target' />
      </>
    ));

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    });
    const outsideTarget = screen.getByRole('textbox', { name: 'Outside target' });

    await act(() => {
      fireEvent.pointerDown(outsideTarget);
      outsideTarget.focus();
    });
    await new Promise((resolve) => setTimeout(resolve));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(outsideTarget).toBe(document.activeElement);
  });

  it('does not run a stale focus restoration after reopening', async () => {
    renderTest(() => (
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    const trigger = screen.getByRole('button', { name: 'Actions' });
    await act(() => {
      fireEvent.click(trigger);
    });
    await act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    });
    await act(() => {
      fireEvent.click(trigger);
    });
    await new Promise((resolve) => setTimeout(resolve));

    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBe(document.activeElement);
  });

  it('composes public events and honors preventDefault', async () => {
    let selected = false;
    let headerClicked = false;
    renderTest(() => (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
          <DropdownMenuContent onKeyDown={(event) => event.preventDefault()}>
            <DropdownMenuItem
              onClick={(event) => event.preventDefault()}
              onSelect={() => {
                selected = true;
              }}
            >
              Keep open
            </DropdownMenuItem>
            <DropdownMenuItem>Other</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger>Popover</PopoverTrigger>
          <PopoverContent>
            <PopoverClose onClick={(event) => event.preventDefault()}>Keep popover</PopoverClose>
          </PopoverContent>
        </Popover>
        <ChainOfThought>
          <ChainOfThoughtHeader
            onClick={(event) => {
              headerClicked = true;
              event.preventDefault();
            }}
          >
            Thinking
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>Details</ChainOfThoughtContent>
        </ChainOfThought>
      </>
    ));

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    });
    const firstItem = screen.getByRole('menuitem', { name: 'Keep open' });
    await act(() => {
      fireEvent.keyDown(firstItem, { key: 'ArrowDown' });
      fireEvent.click(firstItem);
    });
    expect(firstItem).toBe(document.activeElement);
    expect(screen.getByRole('menu')).toBeDefined();
    expect(selected).toBe(false);

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Popover' }));
    });
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep popover' }));
    });
    expect(screen.getByRole('button', { name: 'Keep popover' })).toBeDefined();

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Thinking' }));
    });
    expect(headerClicked).toBe(true);
    expect(screen.getByText('Details')).toBeDefined();
  });
});
