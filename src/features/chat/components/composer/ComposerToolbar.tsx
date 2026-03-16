import { ChangeEvent, MouseEvent, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Loader2, Paperclip, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stopActiveChatRequest } from "@/lib/chat/api/chat-orchestrator";
import { submitMessage } from "@/features/chat/components/composer/submit-chat";
import { cn } from "@/lib/utils";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import { ModelSelector } from "./ModelSelector";
import { PromptSelector } from "./PromptSelector";

export function ComposerToolbar() {
  const navigate = useNavigate();
  const status = useChatRequestStore((state) => state.status);
  const input = useComposerStore((state) => state.input);
  const pendingAttachments = useComposerStore(
    (state) => state.pendingAttachments,
  );
  const uploading = useComposerStore((state) => state.uploading);
  const currentRole = useChatSessionStore((state) => state.currentRole);

  const isBusy = status !== "idle";
  const hasText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const hasRole = !!currentRole;
  const sendDisabled = isBusy
    ? false
    : (!hasText && !hasAttachments) || !hasRole || uploading;
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
      },
    );
  };

  const handleSendClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (sendDisabled) {
      triggerBlockedSendAnimation(event.currentTarget);
      return;
    }
    if (isBusy) {
      event.preventDefault();
      stopActiveChatRequest();
    } else {
      void submitMessage((conversationId) =>
        navigate({
          to: "/app/c/$conversationId",
          params: { conversationId },
        }),
      );
    }
  };

  return (
    <div className="flex items-center justify-between px-0.5">
      {/* Left group: Attachments + Prompt */}
      <div className="flex items-center gap-1">
        {/* File picker */}
        <span
          title={
            uploading
              ? "正在上传附件..."
              : "添加附件（支持 JPG、PNG、WebP、GIF，最大 20MB）"
          }
        >
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp,image/gif"
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
              "disabled:cursor-not-allowed disabled:text-(--text-primary)",
            )}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
          </Button>
        </span>
        <PromptSelector />
      </div>

      {/* Right group: Model selector */}
      <div className="flex items-center gap-1">
        <ModelSelector />
        <Button
          type="button"
          aria-disabled={sendDisabled}
          onClick={handleSendClick}
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10 transition-all duration-200",
            sendDisabled
              ? "bg-(--surface-muted) text-(--text-tertiary) hover:bg-(--surface-muted) scale-90 cursor-not-allowed"
              : "bg-(--interactive-primary) text-(--surface-primary) hover:bg-(--interactive-primary) hover:scale-105 active:scale-95",
          )}
        >
          {status === "sending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "streaming" || status === "disconnected" ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <ArrowUp
              className={cn(
                "h-5 w-5 transition-transform duration-300 ease-out",
                !sendDisabled && "rotate-90",
              )}
            />
          )}
        </Button>
      </div>
    </div>
  );
}
