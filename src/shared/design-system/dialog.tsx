import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  omit,
  useContext,
  type Accessor,
} from 'solid-js';
import { Portal, type JSX } from '@solidjs/web';
import { XIcon } from '@/shared/design-system/icons';
import { cn } from '@/shared/core/utils';

type DialogContextValue = {
  contentId: string;
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  setTrigger: (element: HTMLElement) => void;
  trigger: Accessor<HTMLElement | undefined>;
};

const DialogContext = createContext<DialogContextValue>();

function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('Dialog components must be used inside Dialog');
  return context;
}

function Dialog(props: {
  children: JSX.Element;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const open = () => props.open ?? internalOpen();
  const setOpen = (nextOpen: boolean) => {
    if (props.open === undefined) setInternalOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
    if (!nextOpen) setTimeout(() => trigger()?.focus());
  };

  return (
    <DialogContext
      value={{
        contentId: createUniqueId(),
        open,
        setOpen,
        setTrigger,
        trigger,
      }}
    >
      {props.children}
    </DialogContext>
  );
}

type DialogTriggerProps = {
  children?: JSX.Element;
  asChild?: (props: DialogTriggerAttributes) => JSX.Element;
};

type DialogTriggerAttributes = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  'data-state': 'open' | 'closed';
};

function DialogTrigger(props: DialogTriggerProps) {
  const dialog = useDialog();
  const triggerProps: DialogTriggerAttributes = {
    ref: dialog.setTrigger,
    'aria-controls': dialog.contentId,
    get 'aria-expanded'() {
      return dialog.open() ? 'true' : 'false';
    },
    'aria-haspopup': 'dialog',
    get 'data-state'() {
      return dialog.open() ? 'open' : 'closed';
    },
    onClick: () => dialog.setOpen(!dialog.open()),
  };

  if (typeof props.asChild === 'function') return props.asChild(triggerProps);
  return <button {...triggerProps}>{props.children}</button>;
}

type DialogContentProps = JSX.HTMLAttributes<HTMLDivElement> & {
  showCloseButton?: boolean;
  animated?: boolean;
};

function DialogContent(props: DialogContentProps) {
  const dialog = useDialog();
  let content: HTMLDivElement | undefined;

  createEffect(
    () => dialog.open(),
    (open) => {
      if (!open) return;
      const previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dialog.setOpen(false);
          return;
        }

        if (event.key !== 'Tab' || !content) return;
        const focusable = Array.from(
          content.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          content.focus();
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
        content
          ?.querySelector<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )
          ?.focus();
      });
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previouslyFocused?.focus();
      };
    },
  );

  return (
    <>
      {dialog.open() && (
        <Portal>
          <div
            data-slot='dialog-overlay'
            data-state='open'
            class={cn(
              'fixed inset-0 z-(--z-modal-backdrop) bg-black/50',
              props.animated !== false && 'animate-in fade-in-0',
            )}
            onPointerDown={(event) => {
              if (event.currentTarget === event.target) dialog.setOpen(false);
            }}
          />
          <div class='fixed inset-0 z-(--z-modal-content) pointer-events-none'>
            <div
              {...omit(props, 'showCloseButton', 'animated', 'class')}
              ref={(element) => {
                content = element;
                queueMicrotask(() => {
                  if (!props['aria-label'] && !props['aria-labelledby']) {
                    const title = element.querySelector<HTMLElement>('[data-slot="dialog-title"]');
                    if (title) element.setAttribute('aria-labelledby', title.id);
                  }
                  if (!props['aria-describedby']) {
                    const description = element.querySelector<HTMLElement>(
                      '[data-slot="dialog-description"]',
                    );
                    if (description) element.setAttribute('aria-describedby', description.id);
                  }
                });
              }}
              id={dialog.contentId}
              role='dialog'
              aria-modal='true'
              tabindex={-1}
              data-slot='dialog-content'
              data-state='open'
              class={cn(
                'bg-background pointer-events-auto fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg',
                props.animated !== false && 'animate-in fade-in-0 zoom-in-95 duration-200',
                props.class,
              )}
            >
              {props.children}
              {props.showCloseButton !== false && (
                <button
                  type='button'
                  data-slot='dialog-close'
                  class="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-sm text-secondary transition-colors hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => dialog.setOpen(false)}
                >
                  <XIcon />
                  <span class='sr-only'>Close</span>
                </button>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function DialogHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      data-slot='dialog-header'
      class={cn('flex flex-col gap-2 text-center sm:text-left', props.class)}
    >
      {props.children}
    </div>
  );
}

function DialogFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      data-slot='dialog-footer'
      class={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', props.class)}
    >
      {props.children}
    </div>
  );
}

function DialogTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const id = createUniqueId();
  const assignedId = typeof props.id === 'string' ? props.id : id;
  return (
    <h2
      {...omit(props, 'class', 'children')}
      id={assignedId}
      data-slot='dialog-title'
      class={cn('text-lg leading-none font-semibold', props.class)}
    >
      {props.children}
    </h2>
  );
}

type DialogDescriptionProps = JSX.HTMLAttributes<HTMLParagraphElement> & {
  asChild?: (props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) => JSX.Element;
};

function DialogDescription(props: DialogDescriptionProps) {
  const id = createUniqueId();
  const assignedId = typeof props.id === 'string' ? props.id : id;
  const childProps: JSX.AnchorHTMLAttributes<HTMLAnchorElement> = {
    id: assignedId,
    class: cn('text-muted-foreground text-sm', props.class),
  };
  if (typeof props.asChild === 'function') return props.asChild(childProps);
  return (
    <p
      {...omit(props, 'class', 'asChild', 'children')}
      id={assignedId}
      data-slot='dialog-description'
      class={childProps.class}
    >
      {props.children}
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
