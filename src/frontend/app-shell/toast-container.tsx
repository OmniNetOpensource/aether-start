import { For, createSignal } from 'solid-js';
import { Toast } from '@/frontend/app-shell/toast';
import type { ToastMessage } from '@/frontend/app-shell/toast-context';

export function ToastContainer(props: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
  const [exitingIds, setExitingIds] = createSignal(new Set<string>());

  const handleClose = (id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
  };

  const handleExited = (id: string) => {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    props.onRemove(id);
  };

  return (
    <div
      class='fixed top-4 right-4 flex flex-col gap-2 pointer-events-none'
      style={{ 'z-index': 'var(--z-toast)' }}
    >
      <For each={props.toasts}>
        {(toast) => (
          <div class='pointer-events-auto'>
            <Toast
              toast={toast}
              isExiting={exitingIds().has(toast.id)}
              onClose={() => handleClose(toast.id)}
              onExited={() => handleExited(toast.id)}
            />
          </div>
        )}
      </For>
    </div>
  );
}
