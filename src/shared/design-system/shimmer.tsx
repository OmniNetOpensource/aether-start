import { Dynamic } from '@solidjs/web';
import { cn } from '@/shared/core/utils';

type ShimmerElement = 'p' | 'span' | 'div';

export interface TextShimmerProps {
  children: string;
  as?: ShimmerElement;
  class?: string;
  duration?: number;
  spread?: number;
}

export function Shimmer(props: TextShimmerProps) {
  return (
    <Dynamic
      component={props.as ?? 'p'}
      class={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent',
        '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
        props.class,
      )}
      style={{
        '--spread': `${props.children.length * (props.spread ?? 2)}px`,
        'background-image':
          'var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))',
        animation: `shimmer ${props.duration ?? 2}s linear infinite`,
      }}
    >
      {props.children}
    </Dynamic>
  );
}
