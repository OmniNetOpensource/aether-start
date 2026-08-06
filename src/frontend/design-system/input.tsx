import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';

import { cn } from '@/shared/core/utils';

type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  class?: string;
  onChange?: JSX.EventHandlerUnion<HTMLInputElement, InputEvent>;
};

function Input(props: InputProps) {
  return (
    <input
      {...omit(props, 'class', 'onChange')}
      data-slot='input'
      class={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-ring selection:text-foreground border-border h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive aria-invalid:border-destructive',
        props.class,
      )}
      onInput={props.onChange}
    />
  );
}

export { Input };
