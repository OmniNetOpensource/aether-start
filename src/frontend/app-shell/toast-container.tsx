import { useEffect, useRef, useState } from 'react';
import { Toast } from '@/frontend/app-shell/toast';
import type { ToastMessage } from '@/frontend/app-shell/toast-context';

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}) {
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      exitTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const handleClose = (id: string) => {
    if (exitTimers.current.has(id)) return;

    setExitingIds((current) => new Set(current).add(id));
    exitTimers.current.set(
      id,
      setTimeout(() => {
        exitTimers.current.delete(id);
        onRemove(id);
      }, 200),
    );
  };

  return (
    <div
      className='fixed top-4 right-4 flex flex-col gap-2 pointer-events-none'
      style={{ zIndex: 'var(--z-toast)' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={exitingIds.has(toast.id) ? 'pointer-events-none' : 'pointer-events-auto'}
        >
          <Toast
            toast={toast}
            isExiting={exitingIds.has(toast.id)}
            onClose={() => handleClose(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
