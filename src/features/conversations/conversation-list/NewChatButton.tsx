import { useNavigate } from '@tanstack/solid-router';
import type { JSX } from '@solidjs/web';
import { Pencil } from '@/shared/design-system/icons';
import { buttonVariants } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';

interface NewChatButtonProps {
  isCollapsed?: boolean;
  variant?: 'sidebar' | 'topbar';
  class?: string;
  children?: JSX.Element;
}

export function NewChatButton(props: NewChatButtonProps) {
  const isTopbar = () => (props.variant ?? 'sidebar') === 'topbar';
  const navigate = useNavigate();

  const defaultContent = (
    <>
      <span class='flex h-10 w-10 shrink-0 items-center justify-center'>
        <Pencil class='h-5 w-5 transition-transform duration-300 group-hover:rotate-90' />
      </span>
      {isTopbar() ? (
        <span class='sr-only'>新对话</span>
      ) : (
        <span
          class='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'
          style={{
            width: props.isCollapsed ? '0' : 'auto',
            opacity: props.isCollapsed ? 0 : 1,
          }}
        >
          新对话
        </span>
      )}
    </>
  );

  return (
    <a
      href='/app'
      onClick={(event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        void navigate({ to: '/app' }).catch((error) => {
          console.error('Failed to navigate to new chat:', error);
        });
      }}
      class={cn(
        buttonVariants({ variant: 'ghost', size: isTopbar() ? 'icon-lg' : 'default' }),
        'group relative h-10 overflow-hidden transition-all duration-300',
        isTopbar()
          ? 'w-10 rounded-lg hover:bg-hover hover:text-foreground'
          : 'justify-start px-3 rounded-md border border-border bg-muted text-foreground shadow-xs hover:shadow-sm hover:bg-hover',
        props.class,
      )}
      style={isTopbar() ? undefined : { width: props.isCollapsed ? '40px' : '100%' }}
      aria-label='新对话'
    >
      {props.children ?? defaultContent}
    </a>
  );
}
