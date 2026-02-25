
import {
  ClipboardEvent,
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { X } from "lucide-react";
import { ImagePreview } from "@/components/ImagePreview";
import { useComposerStore } from "@/stores/useComposerStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { useIsNewChat } from "@/stores/useMessageTreeStore";
import { setComposerTextarea } from "@/features/chat/composer/lib/composer-focus";
import { ComposerToolbar } from "./ComposerToolbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/useToast";
import { useResponsive } from "@/features/responsive/ResponsiveContext";

export function Composer() {
  const input = useComposerStore((state) => state.input);
  const pending = useChatRequestStore((state) => state.pending);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const uploading = useComposerStore((state) => state.uploading);
  const currentRole = useChatRequestStore((state) => state.currentRole);
  const deviceType = useResponsive();
  const isDesktop = deviceType === "desktop";
  const setInput = useComposerStore((state) => state.setInput);
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const sendMessage = useChatRequestStore((state) => state.sendMessage);
  const stop = useChatRequestStore((state) => state.stop);

  const submitMessage = async () => {
    const trimmed = input.trim();
    const hasContent = trimmed.length > 0;
    const hasAttachment = pendingAttachments.length > 0;
    const hasRole = !!currentRole;

    if (pending || (!hasContent && !hasAttachment) || !hasRole) {
      if (!hasRole) {
        toast.warning("请先选择角色");
      }
      return;
    }

    await sendMessage();
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const textareaCallbackRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    setComposerTextarea(el);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = event.key === "Enter";
    if (isEnter && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const pastedFiles: File[] = [];

    if (clipboardData.files?.length) {
      pastedFiles.push(...Array.from(clipboardData.files));
    } else if (clipboardData.items?.length) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind !== "file") {
          continue;
        }
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length === 0) {
      return;
    }

    event.preventDefault();

    if (uploading) {
      toast.info("正在上传附件，请稍后再试。");
      return;
    }

    void addAttachments(pastedFiles);
  };

  const handleSendButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      event.preventDefault();
      stop();
    }
  };

  const hasText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const hasRole = !!currentRole;
  const sendDisabled = pending
    ? false
    : (!hasText && !hasAttachments) ||
      !hasRole ||
      uploading;
  const isNewchat = useIsNewChat();

  if (isNewchat) {
    return (
      <form
        key="form-initial"
        onSubmit={(e) => {
          e.preventDefault()
          void submitMessage()
        }}
        className="flex flex-col flex-1 items-center justify-center py-12 w-[90%] md:w-[70%] lg:w-[50%] mx-auto gap-3"
      >
        <div className="relative flex w-full flex-col gap-1 rounded-xl border ink-border bg-background p-2 shadow-lg transition-all focus-within:border-(--interactive-secondary) focus-within:shadow-xl">
          {hasAttachments && (
            <div className="flex flex-wrap gap-2 rounded-xl bg-(--surface-muted) px-0 py-0">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="group relative">
                  <ImagePreview
                    url={attachment.url}
                    name={attachment.name}
                    size={attachment.size}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="移除附件"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute right-1 top-1 h-6 w-6 rounded-full bg-(--interactive-primary)/50 text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--interactive-primary)/70 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex w-full items-end gap-2">
            <Textarea
              ref={textareaCallbackRef}
              id="message-input"
              name="message"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              placeholder="输入您的消息..."
              enterKeyHint={isDesktop ? undefined : "enter"}
              className="min-h-10 max-h-50 flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
              style={{ height: "44px" }}
            />

          </div>

          <ComposerToolbar
            pending={pending}
            sendDisabled={sendDisabled}
            onSendButtonClick={handleSendButtonClick}
          />
        </div>
      </form>
    );
  }

  return (
    <div
      key="composer-wrapper"
      className="absolute inset-x-0 bottom-0 z-(--z-composer) pb-4 md:pb-6"
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{
          background:
            "linear-gradient(to top, var(--surface-primary) 0%, color-mix(in srgb, var(--surface-primary) 90%, transparent) 60%, transparent 100%)",
        }}
      />
      <form
        key="form-bottom"
        onSubmit={(e) => {
          e.preventDefault()
          void submitMessage()
        }}
        className="relative flex flex-col w-[90%] md:w-[70%] lg:w-[50%] mx-auto gap-3"
      >
        <div className="relative flex w-full flex-col gap-1 rounded-xl border ink-border bg-background p-2 shadow-lg transition-all focus-within:border-(--interactive-secondary) focus-within:shadow-xl">
        {hasAttachments && (
          <div className="flex flex-wrap gap-2 rounded-xl bg-(--surface-muted) px-0 py-0">
            {pendingAttachments.map((attachment) => (
              <div key={attachment.id} className="group relative">
                <ImagePreview
                  url={attachment.url}
                  name={attachment.name}
                  size={attachment.size}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="移除附件"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-(--interactive-primary)/50 text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--interactive-primary)/70 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex w-full items-end gap-2">
          <Textarea
            ref={textareaRef}
            id="message-input"
            name="message"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder="输入您的消息..."
            enterKeyHint={isDesktop ? undefined : "enter"}
            className="min-h-10 max-h-50 flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
            style={{ height: "44px" }}
          />

        </div>

        <ComposerToolbar
          pending={pending}
          sendDisabled={sendDisabled}
          onSendButtonClick={handleSendButtonClick}
        />
      </div>
      </form>
    </div>
  );
}
