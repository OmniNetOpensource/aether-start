import { createContext, useContext, useState, type ReactNode } from 'react';
import { ToastContainer } from './toast-container';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type ToastMessage = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
};

export type ToastApi = Record<ToastVariant, (message: string, duration?: number) => string>;

const ToastContext = createContext<ToastApi | null>(null);
const defaultDuration = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (variant: ToastVariant, message: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((current) => [
      ...current,
      { id, message, variant, duration: duration ?? defaultDuration },
    ]);
    return id;
  };

  const [toast] = useState<ToastApi>(() => ({
    info: (message, duration) => addToast('info', message, duration),
    success: (message, duration) => addToast('success', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    error: (message, duration) => addToast('error', message, duration),
  }));

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer
        toasts={toasts}
        onRemove={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return toast;
}
