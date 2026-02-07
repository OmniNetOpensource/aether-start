"use client";

import { ChangeEvent, useRef } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useComposerStore } from "@/src/features/chat/store/useComposerStore";
import { RoleSelector } from "./RoleSelector";

export function ComposerToolbar() {
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
      </div>
    </div>
  );
}
