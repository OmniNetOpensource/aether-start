"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon, InfoIcon, CheckCircle2Icon, AlertTriangleIcon, AlertCircleIcon } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/shared/lib/utils";
import { Toast as ToastType } from "@/shared/stores/toast";

const toastVariants = cva(
  "relative flex items-start gap-3 rounded-md border p-4 shadow-lg transition-all",
  {
    variants: {
      variant: {
        info: "bg-background border-border text-foreground",
        success: "bg-background border-border text-foreground",
        warning: "bg-background border-border text-foreground",
        error: "bg-background border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconVariants = cva("shrink-0", {
  variants: {
    variant: {
      info: "text-[color:var(--status-info)]",
      success: "text-[color:var(--status-success)]",
      warning: "text-[color:var(--status-warning)]",
      error: "text-[color:var(--status-destructive)]",
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

const iconMap = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  error: AlertCircleIcon,
};

interface ToastProps extends VariantProps<typeof toastVariants> {
  toast: ToastType;
  onClose: () => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  const Icon = iconMap[toast.variant];

  React.useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className={cn(toastVariants({ variant: toast.variant }))}
    >
      <Icon className={cn(iconVariants({ variant: toast.variant }), "size-5")} />
      <div className="flex-1 text-sm leading-relaxed">{toast.message}</div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="Close"
      >
        <XIcon className="size-4" />
      </button>
    </motion.div>
  );
}
