import { toPng } from "html-to-image";
import { Check, Copy, Download, Link2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/useToast";
import {
  buildMessageSnippet,
  downloadDataUrl,
  prepareCrossOriginImagesForExport,
  sanitizeFilename,
  waitForImages,
} from "@/lib/chat/export-utils";
import { cn } from "@/lib/utils";
import { ReadonlyMessageList } from "@/features/share/components/ReadonlyMessageList";
import {
  createConversationShareFn,
  getConversationShareFn,
  revokeConversationShareFn,
} from "@/server/functions/shares";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useConversationsStore } from "@/stores/zustand/useConversationsStore";
import { useMessageTreeStore } from "@/stores/zustand/useMessageTreeStore";
import type { Message } from "@/types/message";
import type { ConversationShareStatus } from "@/types/share";

// --- Types ---

type ShareablePathMessage = { id: number; pathIndex: number; message: Message };

export type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// --- Constants ---

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "用户",
  assistant: "助手",
};

const EXPORT_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// --- Helpers ---

const capturePixelRatio = () => {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return Math.min(coarse ? 1 : 2, dpr);
};

const waitForFrames = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

const buildShareUrl = (token: string) =>
  typeof window === "undefined"
    ? `/share/${encodeURIComponent(token)}`
    : `${window.location.origin}/share/${encodeURIComponent(token)}`;

// --- ShareDialog ---

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const messages = useMessageTreeStore((s) => s.messages);
  const currentPath = useMessageTreeStore((s) => s.currentPath);
  const conversationId = useMessageTreeStore((s) => s.conversationId);
  const status = useChatRequestStore((s) => s.status);
  const conversations = useConversationsStore((s) => s.conversations);
  const isBusy = status !== "done";

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareStatus, setShareStatus] =
    useState<ConversationShareStatus>("not_shared");
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareActionLoading, setShareActionLoading] = useState<
    "create" | "revoke" | null
  >(null);
  const [copied, setCopied] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const pathMessages = currentPath
    .map((id, pathIndex) => {
      const message = messages[id - 1];
      return message
        ? ({ id, pathIndex, message } satisfies ShareablePathMessage)
        : null;
    })
    .filter((item): item is ShareablePathMessage => item !== null);

  const selectedMessages = pathMessages.filter(({ id }) => selectedIds.has(id));
  const selectedCount = selectedMessages.length;
  const selectedPreviewMessages = selectedMessages.map(
    ({ message }) => message,
  );

  const conversationTitle = (() => {
    if (!conversationId) return "Aether";
    const c = conversations.find((c) => c.id === conversationId);
    return c?.title?.trim() || "Aether";
  })();

  const shareUrl = shareToken ? buildShareUrl(shareToken) : null;

  const resetState = () => {
    setSelectedIds(new Set());
    setIsGenerating(false);
    setShareStatus("not_shared");
    setShareToken(null);
    setShareLoading(false);
    setShareActionLoading(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open || !conversationId) {
      if (open && !conversationId) {
        setShareStatus("not_shared");
        setShareToken(null);
      }
      return;
    }
    let cancelled = false;
    setShareLoading(true);
    getConversationShareFn({ data: { conversationId } })
      .then((r) => {
        if (!cancelled) {
          setShareStatus(r.status);
          setShareToken(r.token ?? null);
        }
      })
      .catch((e) => {
        console.error("Failed to load share status", e);
        if (!cancelled) {
          toast.error("读取分享状态失败");
          setShareStatus("not_shared");
          setShareToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setShareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const toggleSelection = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const handleCreateShare = async () => {
    if (!conversationId) return toast.error("当前会话不可分享");
    if (pathMessages.length === 0) return toast.warning("当前没有可分享的消息");
    setShareActionLoading("create");
    try {
      const r = await createConversationShareFn({
        data: { conversationId, title: conversationTitle },
      });
      setShareStatus("active");
      setShareToken(r.token);
      toast.success("URL 分享已开启");
    } catch (e) {
      console.error("Failed to create share", e);
      toast.error("开启分享失败，请重试");
    } finally {
      setShareActionLoading(null);
    }
  };

  const handleRevokeShare = async () => {
    if (!conversationId) return;
    setShareActionLoading("revoke");
    try {
      await revokeConversationShareFn({ data: { conversationId } });
      setShareStatus("revoked");
      toast.success("已取消 URL 分享");
    } catch (e) {
      console.error("Failed to revoke share", e);
      toast.error("取消分享失败，请重试");
    } finally {
      setShareActionLoading(null);
    }
  };

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("分享链接已复制");
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("Failed to copy", e);
      toast.error("复制失败，请手动复制");
    }
  };

  const handleDownload = async () => {
    if (selectedCount === 0) return;
    setIsGenerating(true);
    let restore: (() => void) | null = null;
    try {
      await document.fonts?.ready;
      await waitForFrames();
      const node = captureRef.current;
      if (!node) throw new Error("capture node not ready");
      restore = await prepareCrossOriginImagesForExport(node);
      await waitForImages(node);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: capturePixelRatio(),
        fontEmbedCSS: "",
      });
      const filename = `Aether-${sanitizeFilename(conversationTitle)}.png`;
      await downloadDataUrl(dataUrl, filename);
      toast.success("图片已保存");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("Failed to download", e);
      toast.error("导出失败，请重试");
    } finally {
      restore?.();
      setIsGenerating(false);
    }
  };

  const isLoading = shareActionLoading !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl px-8 py-8 overflow-hidden flex flex-col">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-medium tracking-tight">
            分享
          </DialogTitle>
          <DialogDescription className="text-(--text-tertiary)">
            开启 URL 分享或导出 PNG 图片
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-(--surface-muted)/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-(--text-primary)">
              <Link2 className="h-4 w-4" /> URL 分享
            </div>
            {shareLoading ? (
              <div className="flex items-center gap-2 text-sm text-(--text-tertiary)">
                <Loader2 className="h-4 w-4 animate-spin" /> 读取分享状态...
              </div>
            ) : shareStatus === "active" && shareUrl ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-(--text-secondary) break-all">
                  {shareUrl}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopyUrl}
                    disabled={isLoading}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "已复制" : "复制链接"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleRevokeShare}
                    disabled={isLoading}
                    className="text-destructive"
                  >
                    {shareActionLoading === "revoke" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> 取消中
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" /> 取消分享
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-(--text-tertiary)">
                  {shareStatus === "revoked"
                    ? "该链接已取消，可重新开启"
                    : "开启后可通过 URL 公开访问"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateShare}
                  disabled={isLoading || isBusy || pathMessages.length === 0}
                >
                  {shareActionLoading === "create" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> 处理中
                    </>
                  ) : shareStatus === "revoked" ? (
                    "重新开启分享"
                  ) : (
                    "开启 URL 分享"
                  )}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <div className="max-h-[44vh] overflow-y-auto -mx-1 px-1">
              {pathMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-(--text-tertiary)">
                  当前没有可分享的消息
                </div>
              ) : (
                <div className="space-y-px">
                  {pathMessages.map(({ id, message, pathIndex }) => {
                    const isSelected = selectedIds.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSelection(id)}
                        className={cn(
                          "flex w-full cursor-pointer items-start gap-3 rounded-lg border-l-2 px-4 py-3.5 text-left transition-colors",
                          isSelected
                            ? "border-l-(--interactive-primary) bg-(--surface-muted)/50"
                            : "border-l-transparent hover:bg-(--surface-hover)",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-(--text-tertiary)">
                            <span
                              className={
                                message.role === "user"
                                  ? "font-medium text-(--text-secondary)"
                                  : ""
                              }
                            >
                              {ROLE_LABEL[message.role]}
                            </span>
                            <span>·</span>
                            <span>#{pathIndex + 1}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-(--text-secondary)">
                            {buildMessageSnippet(message)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="text-(--text-secondary)"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={selectedCount === 0 || isGenerating || isBusy}
            className="min-w-24"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 生成中
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> 下载
              </>
            )}
          </Button>
        </DialogFooter>

        <div
          aria-hidden
          className="pointer-events-none fixed -left-3000 top-0 opacity-100"
        >
          <div
            ref={captureRef}
            className="rounded-2xl border border-border bg-background p-10 text-foreground"
            style={{ width: 960, fontFamily: EXPORT_FONT }}
          >
            <ReadonlyMessageList
              messages={selectedPreviewMessages}
              usePageScroll
              listClassName="pb-6"
            />
            <footer className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
              Exported from Aether
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
