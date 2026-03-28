import { Link } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';

type LinkComponentProps = ComponentProps<typeof Link>;

interface NewChatButtonProps extends Omit<LinkComponentProps, 'to'> {
  isCollapsed?: boolean;
  variant?: 'sidebar' | 'topbar';
  className?: string;
  children?: ReactNode;
}

export function NewChatButton({
  isCollapsed = false,
  variant = 'sidebar',
  className,
  children,
  onClick,
  ...props
}: NewChatButtonProps) {
  const isTopbar = variant === 'topbar';

  const defaultContent = (
    <>
      <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
        <Pencil className='h-5 w-5 transition-transform duration-300 group-hover:rotate-90' />
      </span>
      {isTopbar ? (
        <span className='sr-only'>新对话</span>
      ) : (
        <span
          className='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'
          style={{
            width: isCollapsed ? 0 : 'auto',
            opacity: isCollapsed ? 0 : 1,
          }}
        >
          新对话
        </span>
      )}
    </>
  );

  return (
    <Button
      asChild
      variant='ghost'
      size={isTopbar ? 'icon-lg' : 'default'}
      className={cn(
        'group relative h-10 overflow-hidden transition-all duration-300',
        isTopbar
          ? 'w-10 rounded-lg hover:bg-(--surface-hover) hover:text-(--text-primary)'
          : 'justify-start px-3 rounded-md border border-border bg-(--surface-muted) text-foreground shadow-[0_1px_2px_#e0e0e0] hover:shadow-[0_2px_6px_#d0d0d0] hover:bg-(--surface-hover) dark:shadow-[0_1px_2px_#1a1a1a] dark:hover:shadow-[0_2px_6px_#252525]',
        className,
      )}
      style={isTopbar ? undefined : { width: isCollapsed ? 40 : '100%' }}
      aria-label='新对话'
    >
      <Link to='/app' onClick={onClick} {...props}>
        {children ?? defaultContent}
      </Link>
    </Button>
  );
}
