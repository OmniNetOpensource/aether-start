
import {
  ClipboardEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
} from "react";
import { useComposerStore } from "@/stores/useComposerStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { useIsNewChat } from "@/stores/useMessageTreeStore";
import { setComposerTextarea } from "@/lib/chat/composer-focus";
import { ComposerToolbar } from "./ComposerToolbar";
import { PeekingAttachments } from "./PeekingAttachments";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/useToast";
import { useResponsive } from "@/components/ResponsiveContext";

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

  const textareaCallbackRef = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    setComposerTextarea(el);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return

      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return

      textareaRef.current?.focus()
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = event.key === "Enter";
    if (isEnter && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };


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
        {hasAttachments && (
          <div className="w-full flex justify-start">
            <PeekingAttachments
              attachments={pendingAttachments}
              onRemove={removeAttachment}
            />
          </div>
        )}
        <div className="relative z-10 flex w-full flex-col gap-1 rounded-xl bg-(--surface-secondary) p-2 transition-all">
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
              className="min-h-10 max-h-50 overflow-y-auto flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
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
        {hasAttachments && (
          <div className="w-full flex justify-start">
            <PeekingAttachments
              attachments={pendingAttachments}
              onRemove={removeAttachment}
            />
          </div>
        )}
        <div className="relative z-10 flex w-full flex-col gap-1 rounded-xl bg-(--surface-secondary) p-2 transition-all">

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
            className="min-h-10 max-h-50 overflow-y-auto flex-1 resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
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
