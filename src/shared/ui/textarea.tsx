import * as React from 'react';

import { cn } from '@/lib/utils';

const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function Textarea({ className, onChange, ref, ...props }: React.ComponentProps<'textarea'>) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!supportsFieldSizing && innerRef.current) {
      autoResize(innerRef.current);
    }
  });

  return (
    <textarea
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      data-slot='textarea'
      className={cn(
        'flex field-sizing-content w-full outline-none disabled:cursor-not-allowed',
        className,
      )}
      onChange={(e) => {
        if (!supportsFieldSizing) autoResize(e.currentTarget);
        onChange?.(e);
      }}
      {...props}
    />
  );
}

export { Textarea };
