import type { CSSProperties, ElementType } from 'react';
import { cn } from '@/shared/core/utils';

type ShimmerElement = 'p' | 'span' | 'div';

export interface TextShimmerProps {
  children: string;
  as?: ShimmerElement;
  className?: string;
  duration?: number;
  spread?: number;
}

export function Shimmer({
  as = 'p',
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const Component: ElementType = as;
  const style: CSSProperties & { '--spread': string } = {
    '--spread': `${children.length * spread}px`,
    backgroundImage:
      'var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))',
    animation: `shimmer ${duration}s linear infinite`,
  };

  return (
    <Component
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent',
        '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
        className,
      )}
      style={style}
    >
      {children}
    </Component>
  );
}
