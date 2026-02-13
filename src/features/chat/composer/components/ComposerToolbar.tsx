"use client";

import { ChangeEvent, MouseEvent, useRef } from "react";
import { ArrowUp, Loader2, Paperclip, Square } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useComposerStore } from "@/features/chat/composer/store/useComposerStore";
import { RoleSelector } from "./RoleSelector";

type ComposerToolbarProps = {
  pending: boolean
  sendDisabled: boolean
  onSendButtonClick: (event: MouseEvent<HTMLButtonElement>) => void
}

export function ComposerToolbar({
  pending,
  sendDisabled,
  onSendButtonClick,
}: ComposerToolbarProps) {
  // Store state
  const uploading = useComposerStore((state) => state.uploading);
  const addAttachments = useComposerStore((state) => state.addAttachments);

  // Local state
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)";

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (uploading) return;

    const files = event.target.files;
    if (!files || files.length === 0) return;

    await addAttachments(Array.from(files));
    event.target.value = "";
  };

  const handlePickFiles = () => fileInputRef.current?.click();

  const triggerBlockedSendAnimation = (button: HTMLButtonElement) => {
    if (typeof button.animate !== "function") return;

    button.animate(
      [
        { transform: "translateX(0) scale(1)" },
        { transform: "translateX(-5px) scale(0.98)" },
        { transform: "translateX(5px) scale(0.98)" },
        { transform: "translateX(-4px) scale(0.985)" },
        { transform: "translateX(4px) scale(0.985)" },
        { transform: "translateX(-2px) scale(0.99)" },
        { transform: "translateX(2px) scale(0.99)" },
        { transform: "translateX(0) scale(1)" },
      ],
      {
        duration: 440,
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      }
    );
  };

  const handleSendClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (sendDisabled) {
      triggerBlockedSendAnimation(event.currentTarget);
      return;
    }

    onSendButtonClick(event);
  };

  return (
    <div className="flex items-center justify-between px-1">
      {/* Left group: Attachments */}
      <div className="flex items-center gap-1">
        {/* File picker */}
        <span title={uploading ? "正在上传附件..." : "添加附件"}>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePickFiles}
            disabled={uploading}
            className={cn(
              toolButtonBaseClass,
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:text-(--text-primary)"
            )}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
          </Button>
        </span>
      </div>

      {/* Right group: Role selector */}
      <div className="flex items-center gap-1">
        <RoleSelector />
        <Button
          type={pending || sendDisabled ? "button" : "submit"}
          aria-disabled={sendDisabled}
          onClick={handleSendClick}
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200",
            sendDisabled
              ? "bg-black/10 text-black/30 dark:bg-white/10 dark:text-white/30 hover:bg-black/10 dark:hover:bg-white/10 scale-90 cursor-not-allowed"
              : "bg-black text-white dark:bg-white dark:text-black hover:bg-black dark:hover:bg-white hover:scale-105 active:scale-95"
          )}
        >
          {pending ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <ArrowUp
              className={cn(
                "h-5 w-5 transition-transform duration-300 ease-out",
                !sendDisabled && "rotate-90"
              )}
            />
          )}
        </Button>
      </div>
    </div>
  );
}
