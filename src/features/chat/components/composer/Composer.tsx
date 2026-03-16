import {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
} from "react";
import {
  startChatRequest,
  stopActiveChatRequest,
} from "@/lib/chat/api/chat-orchestrator";
import { useChatRoomNarrow } from "@/features/chat/contexts/ChatRoomNarrowContext";
import { setComposerTextarea } from "@/lib/chat/composer-focus";
import { buildUserBlocks } from "@/lib/conversation/tree/block-operations";
import { computeMessagesFromPath } from "@/lib/conversation/tree/message-tree";
import { useResponsive } from "@/components/ResponsiveContext";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/useToast";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import {
  useChatSessionStore,
  useIsNewChat,
} from "@/stores/zustand/useChatSessionStore";
import { AttachmentStack } from "../AttachmentStack";
import { ComposerToolbar } from "./ComposerToolbar";

export function Composer() {
  const input = useComposerStore((state) => state.input);
  const status = useChatRequestStore((state) => state.status);
  const pendingAttachments = useComposerStore(
    (state) => state.pendingAttachments,
  );
  const uploading = useComposerStore((state) => state.uploading);
  const currentRole = useChatSessionStore((state) => state.currentRole);
  const deviceType = useResponsive();
  const isDesktop = deviceType === "desktop";
  const setInput = useComposerStore((state) => state.setInput);
  const addAttachments = useComposerStore((state) => state.addAttachments);
  const removeAttachment = useComposerStore((state) => state.removeAttachment);
  const isBusy = status !== "idle";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submitMessage = async () => {
    const trimmed = input.trim();
    const hasContent = trimmed.length > 0;
    const hasAttachment = pendingAttachments.length > 0;
    const hasRole = !!currentRole;

    if (isBusy || (!hasContent && !hasAttachment) || !hasRole) {
      if (!hasRole) {
        toast.warning("Select a role before sending a message.");
      }
      return;
    }

    const treeStore = useChatSessionStore.getState();
    const result = treeStore.addMessage(
      "user",
      buildUserBlocks(input, pendingAttachments),
    );
    const pathMessages = computeMessagesFromPath(
      result.messages,
      result.currentPath,
    );

    useComposerStore.getState().clear();

    await startChatRequest({ messages: pathMessages });
  };

  const textareaCallbackRef = (element: HTMLTextAreaElement | null) => {
    textareaRef.current = element;
    setComposerTextarea(element);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      if ((event.target as HTMLElement)?.isContentEditable) {
        return;
      }

      textareaRef.current?.focus();
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Tab" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      useChatSessionStore.getState().cyclePrompt();
      return;
    }

    if (event.key === "Enter" && event.ctrlKey && !event.shiftKey) {
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
      toast.info("Attachments are still uploading. Please wait.");
      return;
    }

    void addAttachments(pastedFiles);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.length) return;
    if (uploading) {
      toast.info("Attachments are still uploading. Please wait.");
      return;
    }
    void addAttachments(files);
  };

  const handleSendButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isBusy) {
      event.preventDefault();
      stopActiveChatRequest();
    } else {
      void submitMessage();
    }
  };

  const hasText = input.trim().length > 0;
  const hasRole = !!currentRole;
  const hasAttachments = pendingAttachments.length > 0;
  const sendDisabled = isBusy
    ? false
    : (!hasText && !hasAttachments) || !hasRole || uploading;
  const isNewChat = useIsNewChat();
  const narrow = useChatRoomNarrow();

  const textarea = (
    <Textarea
      ref={isNewChat ? textareaCallbackRef : textareaRef}
      id="message-input"
      name="message"
      value={input}
      onChange={(event) => {
        setInput(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      rows={1}
      placeholder="Type your message..."
      enterKeyHint={isDesktop ? undefined : "enter"}
      className="min-h-10 max-h-50 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
    />
  );

  const widthClass = narrow ? "w-[90%]" : "w-[50%]";

  if (isNewChat) {
    return (
      <div
        key="composer-initial"
        className={`mx-auto flex flex-1 flex-col items-center justify-center py-12 ${widthClass}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <AttachmentStack
          items={pendingAttachments}
          onRemove={removeAttachment}
        />
        <div className="relative z-10 flex w-full flex-col gap-1 rounded-xl bg-sidebar p-2 transition-all">
          <div className="flex w-full items-end gap-2">{textarea}</div>
          <ComposerToolbar
            status={status}
            sendDisabled={sendDisabled}
            onSendButtonClick={handleSendButtonClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      key="composer-wrapper"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-(--z-composer) pb-4 md:pb-6"
    >
      <div
        key="composer-bottom"
        className={`pointer-events-auto relative mx-auto flex flex-col gap-3 ${widthClass}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <AttachmentStack
          items={pendingAttachments}
          onRemove={removeAttachment}
        />
        <div className="relative z-10 flex w-full flex-col gap-1 rounded-xl bg-sidebar p-2 transition-all">
          <div className="flex w-full items-end gap-2">{textarea}</div>
          <ComposerToolbar
            status={status}
            sendDisabled={sendDisabled}
            onSendButtonClick={handleSendButtonClick}
          />
        </div>
      </div>
    </div>
  );
}
