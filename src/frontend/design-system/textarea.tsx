import { useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react';

import { cn } from '@/shared/core/utils';

const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

type TextareaProps = ComponentPropsWithRef<'textarea'>;

function Textarea({ className, onChange, onInput, ref, ...props }: TextareaProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!supportsFieldSizing && textarea.current) {
      autoResize(textarea.current);
    }
  }, []);

  return (
    <textarea
      {...props}
      ref={(element) => {
        textarea.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content w-full outline-none disabled:cursor-not-allowed',
        className,
      )}
      onInput={(event) => {
        if (!supportsFieldSizing) autoResize(event.currentTarget);
        onInput?.(event);
      }}
      onChange={onChange}
    />
  );
}

export { Textarea };
