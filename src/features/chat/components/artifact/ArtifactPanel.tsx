import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Eye, PanelRightOpen } from "lucide-react";
import { useResponsive } from "@/components/ResponsiveContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from "@/lib/utils";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import {
  ARTIFACT_PREVIEW_MESSAGE_TYPE,
  type ArtifactPreviewPayload,
} from "./preview-protocol";
import { ARTIFACT_PREVIEW_DOCUMENT } from "./preview-document";

function ArtifactPreviewFrame({
  artifactId,
  language,
  code,
}: {
  artifactId: string;
  language: "html" | "react";
  code: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) {
      return;
    }

    const payload: ArtifactPreviewPayload = {
      type: ARTIFACT_PREVIEW_MESSAGE_TYPE,
      artifactId,
      language,
      code,
    };
    frame.postMessage(payload, "*");
  }, [artifactId, language, code]);

  return (
    <iframe
      ref={iframeRef}
      title="Artifact preview"
      srcDoc={ARTIFACT_PREVIEW_DOCUMENT}
      sandbox="allow-scripts"
      className="h-full w-full rounded-md border border-border/50 bg-background"
      onLoad={() => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame) {
          return;
        }

        const payload: ArtifactPreviewPayload = {
          type: ARTIFACT_PREVIEW_MESSAGE_TYPE,
          artifactId,
          language,
          code,
        };
        frame.postMessage(payload, "*");
      }}
    />
  );
}

function ArtifactPanelBody() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const selectedArtifactId = useChatSessionStore(
    (state) => state.selectedArtifactId,
  );
  const artifactView = useChatSessionStore((state) => state.artifactView);
  const setArtifactView = useChatSessionStore((state) => state.setArtifactView);
  const selectArtifact = useChatSessionStore((state) => state.selectArtifact);

  const selectedArtifact =
    artifacts.find((a) => a.id === selectedArtifactId) ?? null;

  if (!selectedArtifact) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        No artifacts yet.
      </div>
    );
  }

  const canPreview = selectedArtifact.status === "completed";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: history dropdown + view toggle */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-1 pb-3">
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--surface-hover)"
              aria-label="选择 artifact"
            >
              <span className="truncate font-medium text-foreground">
                {selectedArtifact.title}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <div className="max-h-64 overflow-y-auto">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  className={cn(
                    "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    artifact.id === selectedArtifact.id
                      ? "bg-(--surface-active) text-foreground"
                      : "text-(--text-secondary) hover:bg-(--surface-hover) hover:text-foreground",
                  )}
                  onClick={() => {
                    selectArtifact(artifact.id);
                    setHistoryOpen(false);
                  }}
                >
                  <div className="truncate font-medium">{artifact.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {artifact.language} · {artifact.status}
                  </div>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex shrink-0 gap-0.5 rounded-md bg-(--surface-muted) p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-sm px-2 py-1 text-xs transition-colors",
              artifactView === "code"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setArtifactView("code")}
          >
            <Braces className="mr-1 inline h-3 w-3" />
            Code
          </button>
          <button
            type="button"
            className={cn(
              "rounded-sm px-2 py-1 text-xs transition-colors",
              artifactView === "preview"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => canPreview && setArtifactView("preview")}
            disabled={!canPreview}
          >
            <Eye className="mr-1 inline h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Main: content only */}
      <div className="min-h-0 flex-1 overflow-hidden pt-4">
          {artifactView === "preview" && canPreview ? (
            <div className="h-full min-h-96">
              <ArtifactPreviewFrame
                artifactId={selectedArtifact.id}
                language={selectedArtifact.language}
                code={selectedArtifact.code}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-96 flex-col gap-3">
              {selectedArtifact.errorMessage ? (
                <div className="rounded-md border border-border/60 bg-(--status-destructive-muted) px-3 py-2 text-xs text-destructive">
                  {selectedArtifact.errorMessage}
                </div>
              ) : null}
              <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-(--surface-muted) p-4 text-xs leading-relaxed text-foreground">
                <code>{selectedArtifact.code}</code>
              </pre>
            </div>
          )}
      </div>
    </div>
  );
}

export function ArtifactToggleButton() {
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const artifactPanelOpen = useChatSessionStore(
    (state) => state.artifactPanelOpen,
  );
  const setArtifactPanelOpen = useChatSessionStore(
    (state) => state.setArtifactPanelOpen,
  );

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={cn(
        "rounded-lg",
        artifactPanelOpen && "bg-(--surface-hover) text-foreground",
      )}
      aria-label={artifactPanelOpen ? "Close artifacts" : "Open artifacts"}
      title={artifactPanelOpen ? "Close artifacts" : "Open artifacts"}
      onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
    >
      <PanelRightOpen className="h-5 w-5" />
    </Button>
  );
}

export function ArtifactPanel() {
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const artifactPanelOpen = useChatSessionStore(
    (state) => state.artifactPanelOpen,
  );
  const setArtifactPanelOpen = useChatSessionStore(
    (state) => state.setArtifactPanelOpen,
  );

  if (artifacts.length === 0) {
    return null;
  }

  if (isMobile) {
    return (
      <Dialog open={artifactPanelOpen} onOpenChange={setArtifactPanelOpen}>
        <DialogContent
          className="w-[min(96vw,72rem)] p-5 sm:max-w-5xl"
          showCloseButton
        >
          <div className="h-[75vh] min-h-0">
            <ArtifactPanelBody />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!artifactPanelOpen) {
    return null;
  }

  return (
    <aside className="hidden h-full w-[min(44vw,38rem)] min-w-88 border-l border-border/40 bg-(--sidebar-surface) px-5 py-4 lg:block">
      <ArtifactPanelBody />
    </aside>
  );
}
