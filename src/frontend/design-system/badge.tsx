import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '@/shared/core/utils';

type BadgeProps = JSX.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
};

function Badge(props: BadgeProps) {
  return (
    <div
      {...omit(props, 'class', 'variant')}
      data-slot='badge'
      class={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        {
          'bg-surface text-foreground hover:bg-hover': (props.variant ?? 'default') === 'default',
          'bg-muted text-secondary hover:bg-hover': props.variant === 'secondary',
          'border border-border bg-transparent text-secondary hover:bg-hover':
            props.variant === 'outline',
          'bg-destructive-muted text-destructive': props.variant === 'destructive',
        },
        props.class,
      )}
    />
  );
}

export { Badge };
