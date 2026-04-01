import { useEffect, useRef, useState } from 'react';
import { Braces, ChevronDown, ExternalLink, Eye, Loader2, X } from 'lucide-react';
import { useResponsive } from '@/shared/app-shell/ResponsiveContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/design-system/popover';
import { cn } from '@/shared/core/utils';
import { truncateMiddle } from '@/shared/core/truncate-middle';
import { toast } from '@/shared/app-shell/useToast';
import { useChatSessionStore } from '@/features/conversations/session';
import { buildPreviewDocument } from './preview-document';
import { deployToNetlifyFn } from './netlify-deploy';
import { ArtifactCodeBlock } from './ArtifactCodeBlock';

function ArtifactPanelBody() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deployingArtifactId, setDeployingArtifactId] = useState<string | null>(null);
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const selectedArtifactId = useChatSessionStore((state) => state.selectedArtifactId);
  const artifactView = useChatSessionStore((state) => state.artifactView);
  const setArtifactView = useChatSessionStore((state) => state.setArtifactView);
  const selectArtifact = useChatSessionStore((state) => state.selectArtifact);

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? null;

  if (!selectedArtifact) {
    return (
      <div className='flex h-full items-center justify-center px-4 py-8 text-sm text-muted-foreground'>
        No artifacts yet.
      </div>
    );
  }

  const canPreview = selectedArtifact.status === 'completed';
  const isDeploying = deployingArtifactId === selectedArtifact.id;
  const deployedAtLabel =
    selectedArtifact.deployed_at === null
      ? null
      : new Date(selectedArtifact.deployed_at).toLocaleString('zh-CN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

  const handleDeploy = () => {
    if (!canPreview || isDeploying) {
      return;
    }

    const artifactId = selectedArtifact.id;
    setDeployingArtifactId(artifactId);
    void deployToNetlifyFn({
      data: {
        artifactId,
        html: buildPreviewDocument(selectedArtifact.code),
      },
    })
      .then((result) => {
        useChatSessionStore.setState((state) => ({
          artifacts: state.artifacts.map((artifact) =>
            artifact.id === artifactId
              ? {
                  ...artifact,
                  deploy_url: result.url,
                  deployed_at: result.deployed_at,
                  updated_at: result.deployed_at,
                }
              : artifact,
          ),
        }));
      })
      .catch((error: unknown) => {
        console.error('[artifact deploy]', error);
        toast.error(error instanceof Error ? error.message : 'Deploy failed');
      })
      .finally(() => {
        setDeployingArtifactId((currentArtifactId) =>
          currentArtifactId === artifactId ? null : currentArtifactId,
        );
      });
  };

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {/* Header: history dropdown + view toggle */}
      <div className='flex shrink-0 items-center justify-between gap-3 px-1 pb-3'>
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <button
              type='button'
              className='flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--surface-hover)'
              aria-label='选择 artifact'
            >
              <span
                className='min-w-0 font-medium text-foreground'
                title={selectedArtifact.title}
              >
                {truncateMiddle(selectedArtifact.title, 44)}
              </span>
              <ChevronDown className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            </button>
          </PopoverTrigger>
          <PopoverContent align='start' className='w-64 p-1'>
            <div className='max-h-64 overflow-y-auto'>
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type='button'
                  className={cn(
                    'w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    artifact.id === selectedArtifact.id
                      ? 'bg-(--surface-active) text-foreground'
                      : 'text-(--text-secondary) hover:bg-(--surface-hover) hover:text-foreground',
                  )}
                  onClick={() => {
                    selectArtifact(artifact.id);
                    setHistoryOpen(false);
                  }}
                >
                  <div className='font-medium' title={artifact.title}>
                    {truncateMiddle(artifact.title, 36)}
                  </div>
                  <div className='mt-0.5 text-xs text-muted-foreground'>{artifact.status}</div>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className='flex shrink-0 items-center gap-2'>
          {isDeploying ? (
            <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground' />
          ) : selectedArtifact.deploy_url ? (
            <a
              href={selectedArtifact.deploy_url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex max-w-40 shrink-0 items-center gap-1 truncate rounded-sm px-2 py-1 text-xs text-foreground underline-offset-2 hover:underline'
            >
              <ExternalLink className='h-3 w-3 shrink-0' />
              <span className='truncate'>Open</span>
            </a>
          ) : (
            <button
              type='button'
              disabled={!canPreview}
              onClick={handleDeploy}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors',
                canPreview
                  ? 'text-muted-foreground hover:bg-(--surface-hover) hover:text-foreground'
                  : 'cursor-not-allowed text-muted-foreground/50',
              )}
            >
              <ExternalLink className='h-3 w-3' />
              Deploy
            </button>
          )}
          {!isDeploying && deployedAtLabel ? (
            <span className='shrink-0 text-xs text-muted-foreground'>
              Deployed {deployedAtLabel}
            </span>
          ) : null}
          <div className='flex shrink-0 gap-0.5 rounded-md bg-(--surface-muted) p-0.5'>
            <button
              type='button'
              className={cn(
                'rounded-sm px-2 py-1 text-xs transition-colors',
                artifactView === 'code'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setArtifactView('code')}
            >
              <Braces className='mr-1 inline h-3 w-3' />
              Code
            </button>
            <button
              type='button'
              className={cn(
                'rounded-sm px-2 py-1 text-xs transition-colors',
                artifactView === 'preview'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setArtifactView('preview')}
            >
              <Eye className='mr-1 inline h-3 w-3' />
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* Main: code + preview both mounted; toggle slides one up / one down */}
      <div className='relative min-h-0 flex-1 overflow-hidden pt-4'>
        <div
          key={`code-${selectedArtifact.id}`}
          className={cn(
            'absolute inset-0 overflow-auto p-4 text-xs leading-relaxed transition-[transform] duration-300 ease-out',
            artifactView === 'code'
              ? 'z-10 translate-y-0'
              : 'pointer-events-none z-0 -translate-y-full',
          )}
        >
          <ArtifactCodeBlock
            code={selectedArtifact.code}
            isCompleted={selectedArtifact.status === 'completed'}
          />
        </div>
        <iframe
          key={`preview-${selectedArtifact.id}`}
          title='Artifact preview'
          srcDoc={buildPreviewDocument(selectedArtifact.code)}
          sandbox='allow-scripts allow-same-origin'
          className={cn(
            'absolute inset-0 h-full w-full rounded-md bg-background transition-[transform] duration-300 ease-out',
            artifactView === 'preview'
              ? 'z-10 translate-y-0'
              : 'pointer-events-none z-0 translate-y-full',
          )}
        />
      </div>
    </div>
  );
}

export default function ArtifactPanel() {
  const deviceType = useResponsive();
  const isMobile = deviceType === 'mobile';
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const artifactPanelOpen = useChatSessionStore((state) => state.artifactPanelOpen);
  const setArtifactPanelOpen = useChatSessionStore((state) => state.setArtifactPanelOpen);
  const [isResizing, setIsResizing] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!artifactPanelOpen && asideRef.current) {
      asideRef.current.style.width = '';
    }
  }, [artifactPanelOpen]);

  if (artifacts.length === 0) {
    return null;
  }

  if (isMobile) {
    if (!artifactPanelOpen) return null;
    return (
      <div className='fixed inset-0 z-(--z-modal-content) flex h-dvh flex-col bg-background px-5 pb-5 pt-14'>
        <button
          type='button'
          onClick={() => setArtifactPanelOpen(false)}
          className='absolute right-4 top-4 rounded-sm p-2 text-(--text-secondary) transition-colors hover:text-foreground'
          aria-label='Close'
        >
          <X className='size-4' />
        </button>
        <div className='flex min-h-0 flex-1 flex-col'>
          <ArtifactPanelBody />
        </div>
      </div>
    );
  }

  const DRAG_THRESHOLD = 10;

  return (
    <aside
      ref={asideRef}
      className={cn(
        'relative hidden shrink-0 overflow-hidden lg:block',
        !isResizing && 'transition-[width] duration-200',
        isResizing && '[&_iframe]:pointer-events-none',
        artifactPanelOpen ? 'w-[min(44vw,38rem)] min-w-88 px-5' : 'w-0 min-w-0 ',
        'h-full bg-(--sidebar-surface)  py-4',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      <div
        className='group absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center'
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
        <div className='h-full w-px bg-border/40 transition-colors group-hover:bg-border' />
      </div>
      <ArtifactPanelBody />
    </aside>
  );
}
