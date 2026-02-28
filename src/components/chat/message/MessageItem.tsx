
import { useState, type ReactNode } from "react";
import Markdown from "@/components/Markdown";
import { splitMarkdownParagraphs } from "@/lib/markdown";
import { ImagePreview } from "@/components/ImagePreview";
import { Message } from "@/types/message";
import { getBranchInfo as getBranchInfoFn } from "@/lib/conversation/tree/message-tree";
import { ResearchBlock } from "../research/ResearchBlock";
import {
  Copy,
  Check,
  AlertCircle,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useMessageTreeStore,
} from "@/stores/useMessageTreeStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { useEditingStore } from "@/stores/useEditingStore";
import { MessageEditor } from "./MessageEditor";
import { BranchNavigator } from "./BranchNavigator";

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
      className="text-2xs text-neutral-500 dark:text-neutral-400"
      title="复制内容"
    >
      {isCopied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
    </Button>
  );
};

type ActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: ReactNode;
};

const ActionButton = ({
  onClick,
  disabled,
  title,
  icon,
}: ActionButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    className="text-2xs text-neutral-500 dark:text-neutral-400"
    title={title}
  >
    {icon}
  </Button>
);

type MessageItemProps = {
  messageId: number;
  index: number;
  depth: number;
  isStreaming: boolean;
};

export function MessageItem({
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

  const branchInfo = getBranchInfoFn(useMessageTreeStore.getState().messages, messageId);

  const handleStartEditing = () => startEditing(messageId);

  const handleRetry = () => retryFromMessage(messageId, depth);

  const handleNavigate = (direction: "prev" | "next") => {
    if (!useChatRequestStore.getState().pending) {
      navigateBranch(messageId, depth, direction);
    }
  };

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
      data-message-id={messageId}
      data-role={message.role}
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

                    const paragraphs = splitMarkdownParagraphs(block.content);
                    return (
                      <div key={blockKey} className="space-y-3">
                        {paragraphs.map((paragraph, i) => (
                          <Markdown
                            key={i}
                            content={paragraph}
                            isAnimating={
                              isStreaming &&
                              blockIndex === contentBlocks.length - 1 &&
                              i === paragraphs.length - 1
                            }
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {shouldShowToolbar && (
            <div
              className="mt-4 flex items-center transition-opacity duration-150 opacity-100 pointer-events-auto"
            >
              {isUser && (
                <>
                  <ActionButton
                    onClick={handleStartEditing}
                    disabled={pending}
                    title="编辑消息"
                    icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  />
                  <ActionButton
                    onClick={handleRetry}
                    disabled={pending}
                    title="重试生成"
                    icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} />}
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
                />
              )}
            </div>
          )}
          {branchInfo && !isEditing && (
            <div
              className="mt-2 flex items-center transition-opacity duration-150 pointer-events-auto"
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
}
