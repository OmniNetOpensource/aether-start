import { omit, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';

import { cn } from '@/shared/core/utils';

const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

type TextareaProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  class?: string;
  onChange?: JSX.EventHandlerUnion<HTMLTextAreaElement, InputEvent>;
};

function Textarea(props: TextareaProps) {
  let textarea: HTMLTextAreaElement | undefined;

  onSettled(() => {
    if (!supportsFieldSizing && textarea) {
      autoResize(textarea);
    }
  });

  return (
    <textarea
      {...omit(props, 'class', 'onChange', 'ref')}
      ref={(element) => {
        textarea = element;
        if (typeof props.ref === 'function') props.ref(element);
      }}
      data-slot='textarea'
      class={cn(
        'flex field-sizing-content w-full outline-none disabled:cursor-not-allowed',
        props.class,
      )}
      onInput={(event) => {
        if (!supportsFieldSizing) autoResize(event.currentTarget);
        if (typeof props.onChange === 'function') props.onChange(event);
      }}
    />
  );
}

export { Textarea };
