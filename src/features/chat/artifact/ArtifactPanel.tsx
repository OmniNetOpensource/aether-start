import { createEffect, createSignal, For } from 'solid-js';
import { Braces, ChevronDown, ExternalLink, Eye, Loader2, X } from '@/shared/design-system/icons';
import { useResponsive } from '@/shared/app-shell/ResponsiveContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/design-system/popover';
import { cn } from '@/shared/core/utils';
import { truncateMiddle } from '@/shared/core/truncate-middle';
import { useToast } from '@/shared/app-shell/useToast';
import {
  artifactPanelOpen,
  artifacts,
  artifactView,
  selectArtifact,
  selectedArtifactId,
  setArtifactPanelOpen,
  setArtifactView,
  updateArtifactDeployment,
} from './artifact-state';
import { buildPreviewDocument } from './preview-document';
import { deployToNetlifyFn } from './netlify-deploy';
import { ArtifactCodeBlock } from './ArtifactCodeBlock';

function ArtifactPanelBody() {
  const toast = useToast();
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [deployingArtifactId, setDeployingArtifactId] = createSignal<string>();
  const selectedArtifact = () =>
    artifacts().find((artifact) => artifact.id === selectedArtifactId());

  const handleDeploy = () => {
    const artifact = selectedArtifact();
    if (!artifact || artifact.status !== 'completed' || deployingArtifactId() === artifact.id) {
      return;
    }

    const artifactId = artifact.id;
    setDeployingArtifactId(artifactId);
    void deployToNetlifyFn({
      data: {
        artifactId,
        html: buildPreviewDocument(artifact.code),
      },
    })
      .then((result) => {
        updateArtifactDeployment(artifactId, result.url, result.deployed_at);
      })
      .catch((error: unknown) => {
        console.error('[artifact deploy]', error);
        toast.error(error instanceof Error ? error.message : 'Deploy failed');
      })
      .finally(() => {
        setDeployingArtifactId((currentArtifactId) =>
          currentArtifactId === artifactId ? undefined : currentArtifactId,
        );
      });
  };

  const body = () => {
    const artifact = selectedArtifact();
    if (!artifact)
      return (
        <div class='flex h-full items-center justify-center px-4 py-8 text-sm text-muted-foreground'>
          No artifacts yet.
        </div>
      );
    const canPreview = artifact.status === 'completed';
    const isDeploying = deployingArtifactId() === artifact.id;
    const deployedAtLabel =
      artifact.deployed_at === null
        ? null
        : new Date(artifact.deployed_at).toLocaleString('zh-CN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
    return (
      <div class='flex h-full min-h-0 flex-col'>
        {/* Header: history dropdown + view toggle */}
        <div class='flex shrink-0 items-center justify-between gap-3 px-1 pb-3'>
          <Popover
            open={historyOpen()}
            onOpenChange={setHistoryOpen}
            positioning={{ placement: 'bottom-start', gutter: 4 }}
          >
            <PopoverTrigger
              asChild={(triggerProps) => (
                <button
                  {...triggerProps}
                  type='button'
                  class='flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover'
                  aria-label='选择 artifact'
                >
                  <span class='min-w-0 font-medium text-foreground' title={artifact.title}>
                    {truncateMiddle(artifact.title, 44)}
                  </span>
                  <ChevronDown class='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                </button>
              )}
            />
            <PopoverContent class='w-64 p-1'>
              <div class='max-h-64 overflow-y-auto'>
                <For each={artifacts()}>
                  {(historyArtifact) => (
                    <button
                      type='button'
                      class={cn(
                        'w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        historyArtifact.id === artifact.id
                          ? 'bg-active text-foreground'
                          : 'text-secondary hover:bg-hover hover:text-foreground',
                      )}
                      onClick={() => {
                        selectArtifact(historyArtifact.id);
                        setHistoryOpen(false);
                      }}
                    >
                      <div class='font-medium' title={historyArtifact.title}>
                        {truncateMiddle(historyArtifact.title, 36)}
                      </div>
                      <div class='mt-0.5 text-xs text-muted-foreground'>
                        {historyArtifact.status}
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </PopoverContent>
          </Popover>
          <div class='flex shrink-0 items-center gap-2'>
            {isDeploying ? (
              <Loader2 class='h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground' />
            ) : artifact.deploy_url ? (
              <a
                href={artifact.deploy_url}
                target='_blank'
                rel='noopener noreferrer'
                class='flex max-w-40 shrink-0 items-center gap-1 truncate rounded-sm px-2 py-1 text-xs text-foreground underline-offset-2 hover:underline'
              >
                <ExternalLink class='h-3 w-3 shrink-0' />
                <span class='truncate'>Open</span>
              </a>
            ) : (
              <button
                type='button'
                disabled={!canPreview}
                onClick={handleDeploy}
                class={cn(
                  'flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors',
                  canPreview
                    ? 'text-muted-foreground hover:bg-hover hover:text-foreground'
                    : 'cursor-not-allowed text-muted-foreground/50',
                )}
              >
                <ExternalLink class='h-3 w-3' />
                Deploy
              </button>
            )}
            {!isDeploying && deployedAtLabel ? (
              <span class='shrink-0 text-xs text-muted-foreground'>Deployed {deployedAtLabel}</span>
            ) : null}
            <div class='flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5'>
              <button
                type='button'
                class={cn(
                  'rounded-sm px-2 py-1 text-xs transition-colors',
                  artifactView() === 'code'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setArtifactView('code')}
              >
                <Braces class='mr-1 inline h-3 w-3' />
                Code
              </button>
              <button
                type='button'
                class={cn(
                  'rounded-sm px-2 py-1 text-xs transition-colors',
                  artifactView() === 'preview'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setArtifactView('preview')}
              >
                <Eye class='mr-1 inline h-3 w-3' />
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Main: code + preview both mounted; toggle slides one up / one down */}
        <div class='relative min-h-0 flex-1 overflow-hidden pt-4'>
          <div
            class={cn(
              'absolute inset-0 overflow-auto p-4 text-xs leading-relaxed transition-[transform] duration-300 ease-out',
              artifactView() === 'code'
                ? 'z-10 translate-y-0'
                : 'pointer-events-none z-0 -translate-y-full',
            )}
          >
            <ArtifactCodeBlock code={artifact.code} isCompleted={artifact.status === 'completed'} />
          </div>
          <iframe
            title='Artifact preview'
            srcdoc={buildPreviewDocument(artifact.code)}
            sandbox='allow-scripts allow-same-origin'
            class={cn(
              'absolute inset-0 h-full w-full rounded-md bg-background transition-[transform] duration-300 ease-out',
              artifactView() === 'preview'
                ? 'z-10 translate-y-0'
                : 'pointer-events-none z-0 translate-y-full',
            )}
          />
        </div>
      </div>
    );
  };
  return <>{body()}</>;
}

export default function ArtifactPanel() {
  const deviceType = useResponsive();
  const [isResizing, setIsResizing] = createSignal(false);
  let aside: HTMLElement | undefined;

  createEffect(artifactPanelOpen, (open) => {
    if (!open && aside) {
      aside.style.width = '';
    }
  });

  const panel = () => {
    if (artifacts().length === 0) return null;
    if (deviceType() === 'mobile') {
      if (!artifactPanelOpen()) return null;
      return (
        <div class='fixed inset-0 z-(--z-modal-content) flex h-dvh flex-col bg-background px-5 pb-5 pt-14'>
          <button
            type='button'
            onClick={() => setArtifactPanelOpen(false)}
            class='absolute right-4 top-4 rounded-sm p-2 text-secondary transition-colors hover:text-foreground'
            aria-label='Close'
          >
            <X class='size-4' />
          </button>
          <div class='flex min-h-0 flex-1 flex-col'>
            <ArtifactPanelBody />
          </div>
        </div>
      );
    }

    const DRAG_THRESHOLD = 10;

    return (
      <aside
        ref={(element) => {
          aside = element;
        }}
        class={cn(
          'relative hidden shrink-0 overflow-hidden lg:block',
          !isResizing() && 'transition-[width] duration-200',
          isResizing() && '[&_iframe]:pointer-events-none',
          artifactPanelOpen() ? 'w-[min(44vw,38rem)] min-w-88 px-5' : 'w-0 min-w-0 ',
          'h-full bg-surface  py-4',
        )}
        style={{
          'transition-timing-function': 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div
          class='group absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center'
          onPointerDown={(e) => {
            const target = e.currentTarget;
            const pointerId = e.pointerId;
            target.setPointerCapture(pointerId);
            const startX = e.clientX;
            let active = false;
            const onMove = (moveEvent: PointerEvent) => {
              if (!target.hasPointerCapture(pointerId)) return;
              if (!active) {
                if (Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD) return;
                active = true;
                setIsResizing(true);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }
              const main = target.closest('main');
              if (!main) return;
              const rect = main.getBoundingClientRect();
              const newWidth = Math.min(
                Math.max(352, rect.right - moveEvent.clientX),
                rect.width - 400,
              );
              const panel = target.parentElement;
              if (panel instanceof HTMLElement) {
                panel.style.width = `${newWidth}px`;
              }
            };
            const onUp = () => {
              target.removeEventListener('pointermove', onMove);
              target.removeEventListener('pointerup', onUp);
              target.removeEventListener('pointercancel', onUp);
              if (active) {
                setIsResizing(false);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
              }
            };
            target.addEventListener('pointermove', onMove);
            target.addEventListener('pointerup', onUp);
            target.addEventListener('pointercancel', onUp);
          }}
          onLostPointerCapture={() => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }}
        >
          <div class='h-full w-px bg-border/40 transition-colors group-hover:bg-border' />
        </div>
        <ArtifactPanelBody />
      </aside>
    );
  };
  return <>{panel()}</>;
}
