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
          'bg-surface text-foreground hover:bg-hover': variant === 'default',
          'bg-muted text-secondary hover:bg-hover': variant === 'secondary',
          'border border-border bg-transparent text-secondary hover:bg-hover':
            variant === 'outline',
          'bg-destructive-muted text-destructive': variant === 'destructive',
        },
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
