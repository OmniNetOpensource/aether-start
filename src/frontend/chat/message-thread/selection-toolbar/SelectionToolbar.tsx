import { Quote } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { addQuoteToActiveInput } from '@/frontend/chat/composer/composer-editor/active-input';
import { useSelectionToolbar } from './useSelectionToolbar';

export function SelectionToolbar(props: { container: () => HTMLElement | null }) {
  const toolbar = useSelectionToolbar(props.container);

  return (
    <>
      {toolbar.hasSelection && (
        <div
          ref={toolbar.setFloating}
          style={toolbar.floatingStyles}
          className='flex gap-1 rounded-lg bg-background p-1 shadow-lg backdrop-blur-md border border-border transition-[opacity,transform] duration-150 ease-[var(--ease-out)] starting:opacity-0 starting:translate-y-1 starting:scale-[0.95]'
          data-selection-toolbar
        >
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => {
              if (!toolbar.text) return;
              addQuoteToActiveInput(toolbar.text);
              toolbar.clearSelection();
            }}
            className='h-8 gap-1.5 rounded-md px-2.5 text-xs hover:bg-hover'
          >
            <Quote className='h-3.5 w-3.5' />
            引用
          </Button>
        </div>
      )}
    </>
  );
}
