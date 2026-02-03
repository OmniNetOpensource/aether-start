"use client";

import { memo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import Markdown from "@/src/shared/components/Markdown";
import { ImagePreview } from "@/src/shared/components/ImagePreview";
import { BranchInfo, Message } from "@/src/features/chat/types/chat";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/src/shared/utils/file";
import { ResearchBlock } from "../research/ResearchBlock";
import {
  Copy,
  Check,
  Paperclip,
  AlertCircle,
  Pencil,
  RotateCcw,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useChatRequestStore,
  useEditingStore,
  useMessageTreeStore,
} from "@/src/features/chat/store";
import { MessageEditor } from "../editing/MessageEditor";
import { BranchNavigator } from "../editing/BranchNavigator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CopyButtonProps = {
  blocks: Message["blocks"];
};

const CopyButton = ({ blocks }: CopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    const text = blocks
      .filter((b) => b.type === "content")
      .map((b) => b.content)
      .join("\n\n");

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-auto gap-1.5 px-2 py-1 text-xs"
      title="复制内容"
    >
      {isCopied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {isCopied ? "已复制" : "复制"}
    </Button>
  );
};

type ActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: ReactNode;
  label: string;
};

const ActionButton = ({
  onClick,
  disabled,
  title,
  icon,
  label,
}: ActionButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    className="h-auto gap-1.5 px-2 py-1 text-xs"
    title={title}
  >
    {icon}
    {label}
  </Button>
);

type BranchConversationButtonProps = {
  messageId: number;
  disabled?: boolean;
};

const BranchConversationButton = ({
  messageId,
  disabled,
}: BranchConversationButtonProps) => {
  const navigate = useNavigate();
  const branchToNewConversation = useMessageTreeStore(
    (state) => state.branchToNewConversation,
  );
  const [open, setOpen] = useState(false);
  const [isBranching, setIsBranching] = useState(false);

  const handleConfirm = async () => {
    if (isBranching) return;
    setIsBranching(true);
    try {
      await branchToNewConversation(messageId, (path) => navigate({ to: path }));
      setOpen(false);
    } finally {
      setIsBranching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 px-2 py-1 text-xs"
          title="创建新对话分支"
          disabled={disabled}
        >
          <GitBranch className="h-3.5 w-3.5" />
          分支对话
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建分支对话</DialogTitle>
          <DialogDescription>
            将以此消息为止的内容创建一个新的对话，原对话保持不变。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isBranching}
          >
            取消
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isBranching}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type MessageItemProps = {
  message: Message;
  messageId: number;
  index: number;
  depth: number;
  isStreaming: boolean;
  branchInfo: BranchInfo | null;
};

export const MessageItem = memo(function MessageItem({
  message,
  messageId,
  index,
  depth,
  isStreaming,
  branchInfo,
}: MessageItemProps) {
  const navigate = useNavigate();
  const pending = useChatRequestStore((state) => state.pending);
  const isEditing = useEditingStore(
    (state) => state.editingState?.messageId === messageId,
  );
  const startEditing = useEditingStore((state) => state.startEditing);
  const retryFromMessage = useEditingStore((state) => state.retryFromMessage);
  const navigateBranch = useMessageTreeStore((state) => state.navigateBranch);
  const isUser = message.role === "user";
  const attachmentBlocks = message.blocks.filter(
    (
      block,
    ): block is Extract<Message["blocks"][number], { type: "attachments" }> =>
      block.type === "attachments",
  );
  const contentBlocks = message.blocks.filter(
    (block) => block.type !== "attachments",
  );

  const shouldShowToolbar = !isEditing && (isUser || !isStreaming);

  return (
    <div
      key={`${message.role}-${index}`}
      className={cn(
        "w-full group/message flex flex-col space-y-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      {isUser && !isEditing && attachmentBlocks.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {attachmentBlocks.flatMap((block) =>
            block.attachments.map((attachment) =>
              attachment.kind === "image" ? (
                <ImagePreview
                  key={attachment.id}
                  url={attachment.displayUrl}
                  name={attachment.name}
                  size={attachment.size}
                  className="shrink-0"
                />
              ) : (
                <div
                  key={attachment.id}
                  className="flex w-[220px] shrink-0 items-center gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-(--surface-primary) text-muted-foreground">
                    <Paperclip className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {attachment.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                    </div>
                  </div>
                </div>
              ),
            ),
          )}
        </div>
      )}

      {(isEditing || (isUser ? contentBlocks.length > 0 : true)) && (
        <>
          {isEditing ? (
            <MessageEditor messageId={messageId} depth={depth} />
          ) : isUser ? (
            <div
              className={cn(
                "rounded-xl sm:rounded-2xl px-4 py-2 sm:px-5 sm:py-2.5 md:px-6 md:py-3",
                "bg-muted text-foreground max-w-[85%]",
              )}
            >
              {contentBlocks.map((block, blockIndex) => {
                const blockKey = `${index}-${blockIndex}`;

                if (block.type === "content") {
                  return (
                    <div
                      key={blockKey}
                      className="text-base leading-relaxed text-foreground"
                    >
                      <Markdown content={block.content} />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ) : (
            <div className="flex flex-col space-y-3 min-w-0 w-full">
              {contentBlocks.map((block, blockIndex) => {
                const blockKey = `${index}-${blockIndex}`;
                if (block.type === "research") {
                  return (
                    <ResearchBlock
                      key={blockKey}
                      items={block.items}
                      blockIndex={blockIndex}
                      messageIndex={index}
                    />
                  );
                }

                if (block.type === "error") {
                  return (
                    <div
                      key={blockKey}
                      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="flex-1 whitespace-pre-wrap">
                        {block.message}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={blockKey}
                    className="text-base leading-relaxed text-foreground"
                  >
                    <Markdown content={block.content} />
                    {isStreaming && blockIndex === contentBlocks.length - 1 && (
                      <span className="ml-1 inline-flex h-5 w-0.5 animate-pulse bg-(--feedback-cursor) align-middle" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Only show copy button for user messages OR for assistant messages when not streaming */}
      {shouldShowToolbar && (
        <div
          className={cn(
            "flex items-center gap-1.5 transition-opacity duration-150 opacity-100 pointer-events-auto",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          {isUser && (
            <>
              <ActionButton
                onClick={() => startEditing(messageId)}
                disabled={pending}
                title="编辑消息"
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="编辑"
              />
              <ActionButton
                onClick={() =>
                  retryFromMessage(messageId, depth, (path: string) =>
                    navigate({ to: path }),
                  )
                }
                disabled={pending}
                title="重试生成"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                label="重试"
              />
            </>
          )}
          <CopyButton blocks={message.blocks} />
          {!isUser && (
            <ActionButton
              onClick={() =>
                retryFromMessage(messageId, depth, (path: string) =>
                  navigate({ to: path }),
                )
              }
              disabled={pending}
              title="重试生成"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              label="重试"
            />
          )}
          {!isUser && !isStreaming && (
            <BranchConversationButton
              messageId={messageId}
              disabled={pending}
            />
          )}
        </div>
      )}
      {branchInfo && !isEditing && (
        <div
          className={cn(
            "flex items-center gap-1.5 transition-opacity duration-150 opacity-100 pointer-events-auto",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <BranchNavigator
            branchInfo={branchInfo}
            onNavigate={(direction) => navigateBranch(messageId, depth, direction)}
            disabled={pending}
          />
        </div>
      )}
    </div>
  );
});
