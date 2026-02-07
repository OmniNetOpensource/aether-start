"use client";

import {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Quote, Square, X } from "lucide-react";
import { ImagePreview } from "@/src/components/ImagePreview";
import { useComposerStore } from "@/src/features/chat/store/useComposerStore";
import { useChatRequestStore } from "@/src/features/chat/store/useChatRequestStore";
import { useIsNewChat } from "@/src/features/chat/store/useMessageTreeStore";
import { ComposerToolbar } from "./ComposerToolbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/src/hooks/useToast";
import { useResponsive } from "@/src/features/responsive/ResponsiveContext";

export function Composer() {
  const navigate = useNavigate();
  const input = useComposerStore((state) => state.input);
  const pending = useChatRequestStore((state) => state.pending);
  const pendingAttachments = useComposerStore((state) => state.pendingAttachments);
  const quotedTexts = useComposerStore((state) => state.quotedTexts);
  const uploading = useComposerStore((state) => state.uploading);
  const currentRole = useChatRequestStore((state) => state.currentRole);
  const deviceType = useResponsive();
  const isDesktop = deviceType === "desktop";
  const setInput = useComposerStore((state) => state.setInput);
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const removeQuotedText = useComposerStore((state) => state.removeQuotedText);
  const setTextareaRef = useComposerStore((state) => state.setTextareaRef);
  const sendMessage = useChatRequestStore((state) => state.sendMessage);
  const stop = useChatRequestStore((state) => state.stop);

  const submitMessage = async () => {
    const trimmed = input.trim();
    const hasContent = trimmed.length > 0;
    const hasAttachment = pendingAttachments.length > 0;
    const hasQuotes = quotedTexts.length > 0;
    const hasRole = !!currentRole;

    if (pending || (!hasContent && !hasAttachment && !hasQuotes) || !hasRole) {
      if (!hasRole) {
        toast.warning("请先选择角色");
      }
      return;
    }

    await sendMessage((path) => navigate({ to: path }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = event.key === "Enter";
    if (isEnter && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeightValue = parseFloat(computedStyle.lineHeight);
    const paddingTopValue = parseFloat(computedStyle.paddingTop);
    const paddingBottomValue = parseFloat(computedStyle.paddingBottom);

    const fallbackLineHeight = 20;
    const lineHeight = Number.isFinite(lineHeightValue)
      ? lineHeightValue
      : fallbackLineHeight;
    const paddingTop = Number.isFinite(paddingTopValue) ? paddingTopValue : 0;
    const paddingBottom = Number.isFinite(paddingBottomValue)
      ? paddingBottomValue
      : 0;
    const maxLines = 5;
    const maxHeight = lineHeight * maxLines + paddingTop + paddingBottom;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  useEffect(() => {
    setTextareaRef(textareaRef);
  }, [setTextareaRef]);

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

  const hasText = input.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const hasQuotes = quotedTexts.length > 0;
  const hasRole = !!currentRole;
  const sendDisabled = pending
    ? false
    : (!hasText && !hasAttachments && !hasQuotes) ||
      !hasRole ||
      uploading;
  const isNewchat = useIsNewChat();

  if (isNewchat) {
    return (
      <form
        key="form-initial"
        onSubmit={handleSubmit}
        className="flex flex-col flex-1 items-center justify-center py-12 w-[90%] md:w-[70%] lg:w-[50%] mx-auto gap-3"
      >
        <div className="relative flex w-full flex-col gap-1 rounded-2xl border ink-border bg-black/[0.03] dark:bg-white/[0.03] p-2 shadow-lg transition-all focus-within:border-(--interactive-secondary) focus-within:shadow-xl">
          {hasQuotes && (
            <div className="flex flex-wrap gap-2 rounded-2xl bg-card px-0 py-0 mb-2">
              {quotedTexts.map((quote) => (
                <div
                  key={quote.id}
                  className="flex min-w-[200px] max-w-full items-start gap-3 rounded-lg border ink-border bg-(--surface-primary) p-2 pr-3 shadow-sm"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border ink-border bg-muted">
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Quote className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground line-clamp-2">
                      {quote.text}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="移除引用"
                    onClick={() => removeQuotedText(quote.id)}
                    className="h-6 w-6 rounded-full hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {hasAttachments && (
            <div className="flex flex-wrap gap-2 rounded-2xl bg-card px-0 py-0">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="group relative">
                  <ImagePreview
                    url={attachment.displayUrl}
                    name={attachment.name}
                    size={attachment.size}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="移除附件"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70 hover:text-destructive"
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
              className="min-h-10 max-h-[200px] flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
              style={{ height: "44px" }}
            />

            <Button
              type={pending ? "button" : "submit"}
              disabled={sendDisabled}
              onClick={(event) => {
                if (pending) {
                  event.preventDefault();
                  stop();
                }
              }}
              size="icon"
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl sm:h-10 sm:w-10 transition-all duration-200",
              sendDisabled
                ? "bg-black/10 text-black/30 dark:bg-white/10 dark:text-white/30 scale-90 cursor-not-allowed"
                : "bg-black text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95"
            )}
            >
              {pending ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </Button>
          </div>

          <ComposerToolbar />
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
        onSubmit={handleSubmit}
        className="relative flex flex-col w-[90%] md:w-[70%] lg:w-[50%] mx-auto gap-3"
      >
        <div className="relative flex w-full flex-col gap-1 rounded-2xl border ink-border bg-black/[0.03] dark:bg-white/[0.03] p-2 shadow-lg transition-all focus-within:border-(--interactive-secondary) focus-within:shadow-xl">
        {hasQuotes && (
          <div className="flex flex-wrap gap-2 rounded-2xl bg-card px-0 py-0 mb-2">
            {quotedTexts.map((quote) => (
              <div
                key={quote.id}
                className="flex min-w-[200px] max-w-full items-start gap-3 rounded-lg border ink-border bg-(--surface-primary) p-2 pr-3 shadow-sm"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border ink-border bg-muted">
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Quote className="h-4 w-4" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground line-clamp-2">
                    {quote.text}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="移除引用"
                  onClick={() => removeQuotedText(quote.id)}
                  className="h-6 w-6 rounded-full hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {hasAttachments && (
          <div className="flex flex-wrap gap-2 rounded-2xl bg-card px-0 py-0">
            {pendingAttachments.map((attachment) => (
              <div key={attachment.id} className="group relative">
                <ImagePreview
                  url={attachment.displayUrl}
                  name={attachment.name}
                  size={attachment.size}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="移除附件"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70 hover:text-destructive"
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
            className="min-h-10 max-h-[200px] flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
            style={{ height: "44px" }}
          />

          <Button
            type={pending ? "button" : "submit"}
            disabled={sendDisabled}
            onClick={(event) => {
              if (pending) {
                event.preventDefault();
                stop();
              }
            }}
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl sm:h-10 sm:w-10 transition-all duration-200",
              sendDisabled
                ? "bg-black/10 text-black/30 dark:bg-white/10 dark:text-white/30 scale-90 cursor-not-allowed"
                : "bg-black text-white dark:bg-white dark:text-black hover:scale-105 active:scale-95"
            )}
          >
            {pending ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </Button>
        </div>

        <ComposerToolbar />
      </div>
      </form>
    </div>
  );
}
