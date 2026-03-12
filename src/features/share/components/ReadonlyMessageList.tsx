import { AlertCircle } from "lucide-react";
import Markdown from "@/components/Markdown";
import { ImagePreview } from "@/components/ImagePreview";
import { getAttachmentPreviewUrl } from "@/lib/chat/attachments";
import { ResearchBlock } from "@/features/chat/components/research/ResearchBlock";
import type { Message } from "@/types/message";

type ReadonlyMessageListProps = {
  messages: Message[];
  className?: string;
  listClassName?: string;
  usePageScroll?: boolean;
};

export function ReadonlyMessageList({
  messages,
  className,
  listClassName,
  usePageScroll = false,
}: ReadonlyMessageListProps) {
  return (
    <div
      className={`relative w-full ${usePageScroll ? "" : "h-full"} ${className ?? ""}`.trim()}
    >
      <div
        className={`w-full ${usePageScroll ? "" : "h-full overflow-y-auto"}`.trim()}
      >
        <div
          role="log"
          aria-live="polite"
          className={`flex-1 min-h-0 flex flex-col mx-auto w-[90%] md:w-[70%] lg:w-[50%] px-1 pb-40 md:pb-44 lg:pb-48 ${listClassName ?? ""}`.trim()}
        >
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            const attachmentBlocks = message.blocks.filter(
              (
                block,
              ): block is Extract<
                Message["blocks"][number],
                { type: "attachments" }
              > => block.type === "attachments",
            );
            const contentBlocks = message.blocks.filter(
              (block) => block.type !== "attachments",
            );
            const shouldRenderBody =
              !isUser ||
              contentBlocks.length > 0 ||
              attachmentBlocks.length > 0;

            return (
              <div
                key={message.id}
                data-message-id={message.id}
                data-role={message.role}
                className="w-full py-10"
              >
                <div className="w-full min-w-0 flex flex-col items-start text-left">
                  <div
                    className={isUser ? "w-full max-w-[90%] ml-auto" : "w-full"}
                  >
                    {shouldRenderBody &&
                      (isUser ? (
                        <div className="rounded-lg bg-(--surface-muted) px-4 py-3">
                          {attachmentBlocks.length > 0 && (
                            <div className="mb-6 flex gap-3 overflow-x-auto">
                              {attachmentBlocks.flatMap((block) =>
                                block.attachments.map((attachment) => (
                                  <ImagePreview
                                    key={attachment.id}
                                    url={attachment.url}
                                    previewUrl={getAttachmentPreviewUrl(
                                      attachment,
                                    )}
                                    name={attachment.name}
                                    size={attachment.size}
                                    className="shrink-0"
                                  />
                                )),
                              )}
                            </div>
                          )}
                          <div className="text-base leading-relaxed text-foreground wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal">
                            {contentBlocks.map((block, blockIndex) =>
                              block.type === "content" ? (
                                <Markdown
                                  key={`${message.id}-${blockIndex}`}
                                  content={block.content}
                                />
                              ) : null,
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col space-y-3 min-w-0 w-full text-base leading-relaxed text-(--text-secondary) wrap-anywhere [&_pre]:break-normal [&_pre]:wrap-normal">
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
                                  className="flex items-start gap-2 rounded-lg border border-destructive bg-(--status-destructive)/10 px-3 py-2 text-sm text-destructive not-italic"
                                >
                                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <div className="flex-1 whitespace-pre-wrap">
                                    {block.message}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <Markdown
                                key={blockKey}
                                content={block.content}
                              />
                            );
                          })}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
