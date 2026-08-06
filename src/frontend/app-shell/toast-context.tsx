import { createContext, createSignal, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
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

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

  const addToast = (variant: ToastVariant, message: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((current) => [
      ...current,
      { id, message, variant, duration: duration ?? defaultDuration },
    ]);
    return id;
  };

  const toast: ToastApi = {
    info: (message, duration) => addToast('info', message, duration),
    success: (message, duration) => addToast('success', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    error: (message, duration) => addToast('error', message, duration),
  };

  return (
    <ToastContext value={toast}>
      {props.children}
      <ToastContainer
        toasts={toasts()}
        onRemove={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
    </ToastContext>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return toast;
}
