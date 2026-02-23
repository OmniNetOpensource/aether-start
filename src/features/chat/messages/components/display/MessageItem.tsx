
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import Markdown from "@/shared/components/Markdown";
import { ImagePreview } from "@/shared/components/ImagePreview";
import { Message } from "@/features/chat/types/chat";
import { getBranchInfo as getBranchInfoFn } from "@/features/conversation/model/tree/message-tree";
import { ResearchBlock } from "../research/ResearchBlock";
import {
  Copy,
  Check,
  AlertCircle,
  Pencil,
  RotateCcw,
  GitBranch,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  useMessageTreeStore,
} from "@/features/chat/messages/store/useMessageTreeStore";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";
import { useEditingStore } from "@/features/chat/messages/store/useEditingStore";
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
} from "@/shared/ui/dialog";

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
      className="h-auto gap-1.5 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground"
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
    className="h-auto gap-1.5 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground"
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
  const branchToNewConversation = useMessageTreeStore(
    (state) => state.branchToNewConversation,
  );
  const [open, setOpen] = useState(false);
  const [isBranching, setIsBranching] = useState(false);

  const handleConfirm = async () => {
    if (isBranching) return;
    setIsBranching(true);
    try {
      const requestState = useChatRequestStore.getState();
      if (requestState.pending) {
        requestState.stop();
      }
      await branchToNewConversation(messageId);
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
          className="h-auto gap-1.5 px-2 py-1 text-2xs text-muted-foreground hover:text-foreground"
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
  messageId: number;
  index: number;
  depth: number;
  isStreaming: boolean;
};

export const MessageItem = memo(function MessageItem({
  messageId,
  index,
  depth,
  isStreaming,
}: MessageItemProps) {
  const message = useMessageTreeStore(
    (state) => state.messages[messageId - 1]
  );
  const pending = useChatRequestStore((state) => state.pending);
  const isEditing = useEditingStore(
    (state) => state.editingState?.messageId === messageId,
  );
  const startEditing = useEditingStore((state) => state.startEditing);
  const retryFromMessage = useEditingStore((state) => state.retryFromMessage);
  const navigateBranch = useMessageTreeStore((state) => state.navigateBranch);

  const branchInfo = useMemo(
    () => getBranchInfoFn(useMessageTreeStore.getState().messages, messageId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [message?.prevSibling, message?.nextSibling, messageId]
  );

  const handleStartEditing = useCallback(
    () => startEditing(messageId),
    [startEditing, messageId]
  );

  const handleRetry = useCallback(
    () => retryFromMessage(messageId, depth),
    [retryFromMessage, messageId, depth]
  );

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!useChatRequestStore.getState().pending) {
        navigateBranch(messageId, depth, direction);
      }
    },
    [navigateBranch, messageId, depth]
  );

  if (!message) return null;
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
  const shouldRenderBody =
    isEditing ||
    !isUser ||
    contentBlocks.length > 0 ||
    attachmentBlocks.length > 0;
  const contentWidthClass = isUser ? "w-full max-w-[90%]" : "w-full";

  const shouldShowToolbar = !isEditing && (isUser || !isStreaming);

  return (
    <div
      key={`${message.role}-${index}`}
      className="w-full py-10"
    >
      <div className="w-full min-w-0 flex flex-col items-start text-left">
        <div
          className={`${contentWidthClass} ${isUser ? "ml-auto" : ""}`}
        >
          {isUser && !isEditing && attachmentBlocks.length > 0 && (
            <div className="mb-6 flex gap-3 overflow-x-auto">
              {attachmentBlocks.flatMap((block) =>
                block.attachments.map((attachment) => (
                  <ImagePreview
                    key={attachment.id}
                    url={attachment.url}
                    name={attachment.name}
                    size={attachment.size}
                    className="shrink-0"
                  />
                )),
              )}
            </div>
          )}

          {shouldRenderBody && (
            <>
              {isEditing ? (
                <MessageEditor messageId={messageId} depth={depth} />
              ) : isUser ? (
                <div className="text-base leading-relaxed text-foreground wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal">
                  {contentBlocks.map((block, blockIndex) => {
                    const blockKey = `${index}-${blockIndex}`;

                    if (block.type === "content") {
                      return <Markdown key={blockKey} content={block.content} />;
                    }

                    return null;
                  })}
                </div>
              ) : (
                <div
                  className="flex flex-col space-y-3 min-w-0 w-full text-base leading-relaxed text-(--text-secondary) wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal"
                >
                  {contentBlocks.map((block, blockIndex) => {
                    const blockKey = `${index}-${blockIndex}`;
                    if (block.type === "research") {
                      return (
                        <div key={blockKey} className="not-italic">
                          <ResearchBlock
                            items={block.items}
                            blockIndex={blockIndex}
                            messageIndex={index}
                          />
                        </div>
                      );
                    }

                    if (block.type === "error") {
                      return (
                        <div
                          key={blockKey}
                          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-(--status-destructive)/10 px-3 py-2 text-sm text-destructive not-italic"
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="flex-1 whitespace-pre-wrap">
                            {block.message}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={blockKey}>
                        <Markdown
                          content={block.content}
                          isAnimating={isStreaming && blockIndex === contentBlocks.length - 1}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {shouldShowToolbar && (
            <div
              className="mt-4 flex items-center gap-1.5 transition-opacity duration-150 opacity-100 pointer-events-auto"
            >
              {isUser && (
                <>
                  <ActionButton
                    onClick={handleStartEditing}
                    disabled={pending}
                    title="编辑消息"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    label="编辑"
                  />
                  <ActionButton
                    onClick={handleRetry}
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
                  onClick={handleRetry}
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
              className="mt-2 flex items-center gap-1.5 transition-opacity duration-150 opacity-100 pointer-events-auto"
            >
              <BranchNavigator
                branchInfo={branchInfo}
                onNavigate={handleNavigate}
                disabled={pending}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
