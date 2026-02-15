"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type BaseResearchCardProps = {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">;
  children?: ReactNode;
  isActive?: boolean;
};

export function BaseResearchCard({
  icon,
  title,
  description,
  action,
  onClick,
  buttonProps,
  children,
  isActive = false,
}: BaseResearchCardProps) {
  const { className: buttonClassName, ...restButtonProps } =
    buttonProps ?? {};

  return (
    <div
      className={cn(
        "group/research-card  border border-border bg-(--surface-secondary) px-3 py-1 transition-all duration-300 ease-in-out",
        "hover:bg-(--surface-hover)",
        isActive && "ring-1 ring-(--interactive-primary)/30"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full min-h-9 flex-nowrap items-center gap-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--interactive-primary)/30",
          !onClick && "cursor-default",
          buttonClassName
        )}
        {...restButtonProps}
      >
        <span className="flex h-4 w-4 items-center justify-center text-foreground">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium text-muted-foreground transition-colors group-hover/research-card:text-(--text-secondary)">
            {title}
          </span>
          {description && (
            <span className="shrink-0 whitespace-nowrap text-2xs text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        {action}
      </button>
      {children}
    </div>
  );
}
