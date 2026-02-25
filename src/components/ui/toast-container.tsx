
import { useCallback, useState } from "react";
import { useToastStore } from "@/stores/toast";
import { Toast } from "@/components/ui/toast";

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const handleClose = useCallback((id: string) => {
    setExitingIds((prev) => new Set(prev).add(id));
  }, []);

  const handleExited = useCallback(
    (id: string) => {
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      removeToast(id);
    },
    [removeToast]
  );

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: "var(--z-toast)" }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
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
