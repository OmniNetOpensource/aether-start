import { useState } from 'react';
import { Toast } from '@/shared/app-shell/toast';
import type { ToastMessage } from '@/shared/app-shell/toast-context';

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}) {
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const handleClose = (id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
  };

  const handleExited = (id: string) => {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onRemove(id);
  };

  return (
    <div
      className='fixed top-4 right-4 flex flex-col gap-2 pointer-events-none'
      style={{ zIndex: 'var(--z-toast)' }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className='pointer-events-auto'>
          <Toast
            toast={toast}
            isExiting={exitingIds.has(toast.id)}
            onClose={() => handleClose(toast.id)}
            onExited={() => handleExited(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
