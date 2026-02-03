"use client";

import { AnimatePresence } from "framer-motion";
import { useToastStore } from "@/src/shared/toast/useToastStore";
import { Toast } from "@/components/ui/toast";

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: "var(--z-toast)" }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onClose={() => removeToast(toast.id)} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
