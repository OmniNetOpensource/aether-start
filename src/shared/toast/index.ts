import { useToastStore, type ToastVariant } from "./useToastStore";

const defaultDuration = 4000;

function createToast(variant: ToastVariant) {
  return (message: string, duration?: number) => {
    const store = useToastStore.getState();
    return store.addToast({
      message,
      variant,
      duration: duration ?? defaultDuration,
    });
  };
}

export const toast = {
  info: createToast("info"),
  success: createToast("success"),
  warning: createToast("warning"),
  error: createToast("error"),
};

export { useToastStore } from "./useToastStore";
export type { Toast, ToastVariant } from "./useToastStore";

