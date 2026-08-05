import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';

interface NewChatButtonProps {
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
          ? 'w-10 rounded-lg hover:bg-hover hover:text-foreground'
          : 'justify-start px-3 rounded-md border border-border bg-muted text-foreground shadow-xs hover:shadow-sm hover:bg-hover',
        className,
      )}
      style={isTopbar ? undefined : { width: isCollapsed ? 40 : '100%' }}
      aria-label='新对话'
    >
      <Link to='/app/{-$conversationId}' params={{ conversationId: undefined }}>
        {children ?? defaultContent}
      </Link>
    </Button>
  );
}
