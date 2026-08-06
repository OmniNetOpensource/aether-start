import { onSettled } from 'solid-js';
import { Dynamic } from '@solidjs/web';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  XIcon,
  InfoIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  AlertCircleIcon,
} from '@/frontend/design-system/icons';

import { cn } from '@/shared/core/utils';
import type { ToastMessage } from '@/frontend/app-shell/toast-context';

const toastVariants = cva(
  'relative flex items-start gap-3 rounded-md border p-4 shadow-lg transition-all',
  {
    variants: {
      variant: {
        info: 'bg-background border-border text-foreground',
        success: 'bg-background border-border text-foreground',
        warning: 'bg-background border-border text-foreground',
        error: 'bg-background border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

const iconVariants = cva('shrink-0', {
  variants: {
    variant: {
      info: 'text-[color:var(--color-info)]',
      success: 'text-[color:var(--color-success)]',
      warning: 'text-[color:var(--color-warning)]',
      error: 'text-[color:var(--color-destructive)]',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const iconMap = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  error: AlertCircleIcon,
};

interface ToastProps extends VariantProps<typeof toastVariants> {
  toast: ToastMessage;
  isExiting?: boolean;
  onClose: () => void;
  onExited: () => void;
}

export function Toast(props: ToastProps) {
  onSettled(() => {
    if (props.toast.duration && props.toast.duration > 0) {
      const timer = setTimeout(() => {
        props.onClose();
      }, props.toast.duration);

      return () => clearTimeout(timer);
    }
  });

  return (
    <div
      class={cn(
        toastVariants({ variant: props.toast.variant }),
        props.isExiting
          ? 'animate-[toast-exit_0.2s_var(--transition-smooth)_forwards]'
          : 'animate-[toast-enter_0.2s_var(--transition-smooth)]',
      )}
      onAnimationEnd={props.isExiting ? props.onExited : undefined}
    >
      <Dynamic
        component={iconMap[props.toast.variant]}
        class={cn(iconVariants({ variant: props.toast.variant }), 'size-5')}
      />
      <div class='flex-1 text-sm leading-relaxed'>{props.toast.message}</div>
      <button
        onClick={props.onClose}
        class='shrink-0 rounded-sm text-secondary transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
        aria-label='Close'
      >
        <XIcon class='size-4' />
      </button>
    </div>
  );
}
