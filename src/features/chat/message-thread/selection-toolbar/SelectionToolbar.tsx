import { createEffect, createSignal, type Accessor } from 'solid-js';
import { Quote } from '@/shared/design-system/icons';
import { Button } from '@/shared/design-system/button';
import { addQuoteToActiveInput } from '@/features/chat/composer/composer-editor/active-input';
import { useSelectionToolbar } from './useSelectionToolbar';

export function SelectionToolbar(props: { container: Accessor<HTMLElement | undefined> }) {
  const toolbar = useSelectionToolbar(props.container);
  const [mounted, setMounted] = createSignal(false);

  createEffect(toolbar.hasSelection, (hasSelection) => {
    if (!hasSelection) {
      setMounted(false);
      return;
    }
    requestAnimationFrame(() => setMounted(true));
  });

  return (
    <>
      {toolbar.hasSelection() && (
        <div
          ref={toolbar.setFloating}
          style={toolbar.floatingStyles()}
          data-mounted={mounted() ? 'true' : 'false'}
          class='flex gap-1 rounded-lg bg-background p-1 shadow-lg backdrop-blur-md border border-border transition-[opacity,transform] duration-150 ease-[var(--ease-out)] data-[mounted=false]:opacity-0 data-[mounted=false]:translate-y-1 data-[mounted=false]:scale-[0.95]'
          data-selection-toolbar
        >
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => {
              if (!toolbar.text()) return;
              addQuoteToActiveInput(toolbar.text());
              toolbar.clearSelection();
            }}
            class='h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-hover'
          >
            <Quote class='h-3.5 w-3.5' />
            引用
          </Button>
        </div>
      )}
    </>
  );
}
