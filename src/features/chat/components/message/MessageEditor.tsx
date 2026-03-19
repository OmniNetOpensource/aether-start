import { ClipboardEvent, KeyboardEvent, useEffect, useRef } from "react";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { AttachmentStack } from "@/features/chat/components/AttachmentStack";
import { useResponsive } from "@/components/ResponsiveContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { buildAttachmentsFromFiles } from "@/shared/attachments";
import { useChatRequestStore } from "@/features/chat/request/useChatRequestStore";
import { useComposerStore } from "@/features/chat/composer/useComposerStore";
import { useEditingStore } from "@/features/chat/editing/useEditingStore";
import { useChatSessionStore } from "@/features/sidebar/useChatSessionStore";

type MessageEditorProps = {
  messageId: number;
  depth: number;
};

export function MessageEditor({ messageId, depth }: MessageEditorProps) {
  const editingState = useEditingStore((state) => state.editingState);
  const updateEditContent = useEditingStore((state) => state.updateEditContent);
  const updateEditQuotes = useEditingStore((state) => state.updateEditQuotes);
  const updateEditAttachments = useEditingStore(
    (state) => state.updateEditAttachments,
  );
  const cancelEditing = useEditingStore((state) => state.cancelEditing);
  const submitEdit = useEditingStore((state) => state.submitEdit);
  const deviceType = useResponsive();
  const isDesktop = deviceType === "desktop";
  const uploading = useComposerStore((state) => state.uploading);
  const status = useChatRequestStore((state) => state.status);
  const currentRole = useChatSessionStore((state) => state.currentRole);
  const isBusy = status !== "idle";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const state = editingState?.messageId === messageId ? editingState : null;

  useEffect(() => {
    if (state && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state]);

  useEffect(() => {
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
  }, [state?.editedContent]);

  if (!state) {
    return null;
  }

  const { editedContent, editedQuotes, editedAttachments } = state;
  const hasText = editedContent.trim().length > 0;
  const hasQuotes = editedQuotes.length > 0;
  const hasAttachments = editedAttachments.length > 0;
  const sendDisabled =
    isBusy ||
    uploading ||
    (!hasText && !hasQuotes && !hasAttachments) ||
    !currentRole;

  const handleAddAttachments = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    if (uploading) {
      toast.info("Attachments are still uploading. Please wait.");
      return;
    }

    const attachments = await buildAttachmentsFromFiles(files);
    if (attachments.length === 0) {
      return;
    }

    updateEditAttachments([...editedAttachments, ...attachments]);
  };

  const handleRemoveQuote = (id: string) => {
    updateEditQuotes(editedQuotes.filter((q) => q.id !== id));
  };

  const handleRemoveAttachment = (id: string) => {
    updateEditAttachments(
      editedAttachments.filter((a) => a.id !== id),
    );
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
    void handleAddAttachments(pastedFiles);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      if (!sendDisabled) {
        submitEdit(depth);
      }
    }
  };

  return (
    <div className="relative flex w-full flex-col gap-2 rounded-xl border bg-(--surface-muted) p-3 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancel editing"
        onClick={cancelEditing}
        className="absolute right-2 top-2 h-7 w-7 text-(--text-secondary) transition-colors hover:text-(--text-primary)"
      >
        <X className="h-4 w-4" />
      </Button>

      {(hasQuotes || hasAttachments) ? (
        <AttachmentStack
          items={editedAttachments}
          quotes={editedQuotes}
          onRemove={handleRemoveAttachment}
          onRemoveQuote={handleRemoveQuote}
        />
      ) : null}

      <Textarea
        ref={textareaRef}
        value={editedContent}
        onChange={(event) => updateEditContent(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={1}
        placeholder="Edit your message..."
        enterKeyHint={isDesktop ? undefined : "enter"}
        className="min-h-10 max-h-[200px] resize-none border-0 bg-transparent py-2.5 text-sm focus-visible:ring-0 sm:text-base"
        style={{ height: "44px" }}
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void handleAddAttachments(files);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add image
          </Button>
        </div>
        <Button
          type="button"
          onClick={() => submitEdit(depth)}
          disabled={sendDisabled}
          size="icon"
          aria-label="Submit edit"
          className={cn(
            "h-8 w-8 rounded-full transition-all duration-200",
            sendDisabled
              ? "cursor-not-allowed bg-(--surface-muted) text-(--text-tertiary)"
              : "hover:scale-105 active:scale-95",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
