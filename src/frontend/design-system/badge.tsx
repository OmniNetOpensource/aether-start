import type { ComponentProps } from 'react';
import { cn } from '@/shared/core/utils';

type BadgeProps = ComponentProps<'div'> & {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      {...props}
      data-slot='badge'
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        {
          'bg-surface text-foreground hover:bg-hover': variant === 'default',
          'bg-muted text-secondary hover:bg-hover': variant === 'secondary',
          'border border-border bg-transparent text-secondary hover:bg-hover':
            variant === 'outline',
          'bg-destructive-muted text-destructive': variant === 'destructive',
        },
        className,
      )}
    />
  );
}

export { Badge };
