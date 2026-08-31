import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@/frontend/design-system/icons';
import { cn } from '@/shared/core/utils';

type DialogContextValue = {
  contentId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  setTrigger: (element: HTMLElement | null) => void;
  trigger: HTMLElement | null;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('Dialog components must be used inside Dialog');
  return context;
}

function Dialog({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const contentId = useId();
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <DialogContext value={{ contentId, open, setOpen, setTrigger, trigger }}>
      {children}
    </DialogContext>
  );
}

type DialogTriggerAttributes = ComponentPropsWithRef<'button'> & {
  'data-state': 'open' | 'closed';
};

type DialogTriggerProps = {
  children?: ReactNode;
  asChild?: (props: DialogTriggerAttributes) => ReactNode;
};

function DialogTrigger({ children, asChild }: DialogTriggerProps) {
  const dialog = useDialog();
  const triggerProps: DialogTriggerAttributes = {
    ref: dialog.setTrigger,
    'aria-controls': dialog.contentId,
    'aria-expanded': dialog.open,
    'aria-haspopup': 'dialog',
    'data-state': dialog.open ? 'open' : 'closed',
    onClick: () => dialog.setOpen(!dialog.open),
  };

  if (asChild) return asChild(triggerProps);
  return <button {...triggerProps}>{children}</button>;
}

type DialogContentProps = ComponentPropsWithRef<'div'> & {
  showCloseButton?: boolean;
  animated?: boolean;
};

function DialogContent({
  showCloseButton = true,
  animated = true,
  className,
  children,
  ref,
  ...props
}: DialogContentProps) {
  const dialog = useDialog();
  const content = useRef<HTMLDivElement>(null);
  const ariaLabel = props['aria-label'];
  const ariaLabelledBy = props['aria-labelledby'];
  const ariaDescribedBy = props['aria-describedby'];
  const open = dialog.open;
  const trigger = dialog.trigger;
  const close = useEffectEvent(() => dialog.setOpen(false));

  useEffect(() => {
    if (!open || !content.current) return;
    const element = content.current;

    if (!ariaLabel && !ariaLabelledBy) {
      const title = element.querySelector<HTMLElement>('[data-slot="dialog-title"]');
      if (title) element.setAttribute('aria-labelledby', title.id);
    }
    if (!ariaDescribedBy) {
      const description = element.querySelector<HTMLElement>('[data-slot="dialog-description"]');
      if (description) element.setAttribute('aria-describedby', description.id);
    }
  }, [ariaDescribedBy, ariaLabel, ariaLabelledBy, open]);

  useEffect(() => {
    if (!open || !content.current) return;
    const element = content.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let active = true;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        element.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    queueMicrotask(() => {
      if (!active) return;
      element
        .querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });

    return () => {
      active = false;
      document.removeEventListener('keydown', handleKeyDown);
      (trigger ?? previouslyFocused)?.focus();
    };
  }, [open, trigger]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        data-slot='dialog-overlay'
        data-state='open'
        className={cn(
          'fixed inset-0 z-(--z-modal-backdrop) bg-black/50',
          animated && 'animate-in fade-in-0',
        )}
        onPointerDown={(event) => {
          if (event.currentTarget === event.target) dialog.setOpen(false);
        }}
      />
      <div className='fixed inset-0 z-(--z-modal-content) pointer-events-none'>
        <div
          {...props}
          ref={(element) => {
            content.current = element;
            if (typeof ref === 'function') ref(element);
            else if (ref) ref.current = element;
          }}
          id={dialog.contentId}
          role='dialog'
          aria-modal='true'
          tabIndex={-1}
          data-slot='dialog-content'
          data-state='open'
          className={cn(
            'bg-background pointer-events-auto fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg',
            animated && 'animate-in fade-in-0 zoom-in-95 duration-200',
            className,
          )}
        >
          {children}
          {showCloseButton && (
            <button
              type='button'
              data-slot='dialog-close'
              className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-sm text-secondary transition-colors hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              onClick={() => dialog.setOpen(false)}
            >
              <XIcon />
              <span className='sr-only'>Close</span>
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot='dialog-header'
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
    />
  );
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot='dialog-footer'
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    />
  );
}

function DialogTitle({ className, id, ...props }: ComponentProps<'h2'>) {
  const generatedId = useId();
  return (
    <h2
      {...props}
      id={id ?? generatedId}
      data-slot='dialog-title'
      className={cn('text-lg leading-none font-semibold', className)}
    />
  );
}

type DialogDescriptionChildProps = ComponentProps<'a'> & {
  'data-slot': 'dialog-description';
};

type DialogDescriptionProps = ComponentProps<'p'> & {
  asChild?: (props: DialogDescriptionChildProps) => ReactNode;
};

function DialogDescription({ className, id, asChild, children, ...props }: DialogDescriptionProps) {
  const generatedId = useId();
  const assignedId = id ?? generatedId;
  const childProps: DialogDescriptionChildProps = {
    id: assignedId,
    'data-slot': 'dialog-description',
    className: cn('text-muted-foreground text-sm', className),
  };
  if (asChild) return asChild(childProps);
  return (
    <p {...props} id={assignedId} data-slot='dialog-description' className={childProps.className}>
      {children}
    </p>
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
