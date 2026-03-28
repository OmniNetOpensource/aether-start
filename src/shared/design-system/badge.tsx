import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/shared/core/utils';

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  asChild?: boolean;
};

function Badge({ variant = 'default', className, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'div';

  return (
    <Comp
      data-slot='badge'
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        {
          'bg-(--surface-secondary) text-(--text-primary) hover:bg-(--surface-hover)':
            variant === 'default',
          'bg-(--surface-muted) text-(--text-secondary) hover:bg-(--surface-hover)':
            variant === 'secondary',
          'border border-border bg-transparent text-(--text-secondary) hover:bg-(--surface-hover)':
            variant === 'outline',
          'bg-(--status-destructive-muted) text-destructive hover:bg-(--status-destructive-muted-hover)':
            variant === 'destructive',
        },
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
