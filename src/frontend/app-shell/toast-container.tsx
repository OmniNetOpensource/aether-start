import { For, createSignal, onCleanup } from 'solid-js';
import { Toast } from '@/frontend/app-shell/toast';
import type { ToastMessage } from '@/frontend/app-shell/toast-context';

export function ToastContainer(props: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
  const [exitingIds, setExitingIds] = createSignal(new Set<string>());
  const exitTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const handleClose = (id: string) => {
    if (exitTimers.has(id)) return;

    setExitingIds((prev) => new Set(prev).add(id));
    exitTimers.set(
      id,
      setTimeout(() => {
        exitTimers.delete(id);
        props.onRemove(id);
      }, 200),
    );
  };

  onCleanup(() => exitTimers.forEach(clearTimeout));

  return (
    <div
      class='fixed top-4 right-4 flex flex-col gap-2 pointer-events-none'
      style={{ 'z-index': 'var(--z-toast)' }}
    >
      <For each={props.toasts}>
        {(toast) => (
          <div class={exitingIds().has(toast.id) ? 'pointer-events-none' : 'pointer-events-auto'}>
            <Toast
              toast={toast}
              isExiting={exitingIds().has(toast.id)}
              onClose={() => handleClose(toast.id)}
            />
          </div>
        )}
      </For>
    </div>
  );
}
