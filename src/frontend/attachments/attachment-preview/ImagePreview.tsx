import { createEffect, createSignal, onSettled } from 'solid-js';
import { Portal } from '@solidjs/web';
import { Loader2 } from '@/frontend/design-system/icons';
import { cn } from '@/shared/core/utils';
import { formatFileSize } from '@/frontend/browser/file';

export type ImagePreviewProps = {
  url: string;
  name: string;
  size: number;
  class?: string;
  uploading?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.1;

export function ImagePreview(props: ImagePreviewProps) {
  const [loaded, setLoaded] = createSignal(false);
  const [isOpen, setIsOpen] = createSignal(false);
  const [scale, setScale] = createSignal(1);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = createSignal(false);
  let dragState: { startX: number; startY: number; originX: number; originY: number } | undefined;

  createEffect(
    () => props.url,
    () => {
      setLoaded(false);
    },
  );
  onSettled(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isOpen() || !isDragging() || !dragState) return;
      setPosition({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      dragState = undefined;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    dragState = undefined;
  };
  const close = () => {
    setIsOpen(false);
    resetView();
  };

  return (
    <>
      <button
        type='button'
        onClick={() => {
          if (props.uploading) return;
          resetView();
          setIsOpen(true);
        }}
        class={cn(
          'relative h-20 w-20 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          props.class,
        )}
        title={`${props.name} (${formatFileSize(props.size)})`}
        aria-label={props.uploading ? `上传中 ${props.name}` : `预览图片 ${props.name}`}
      >
        <img
          src={props.url}
          alt={props.name}
          class={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded() ? 'opacity-100' : 'opacity-0',
          )}
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
        {props.uploading && (
          <span class='absolute inset-0 flex items-center justify-center bg-black/30'>
            <Loader2 class='h-6 w-6 animate-spin text-white' aria-hidden='true' />
          </span>
        )}
      </button>

      {isOpen() && (
        <Portal>
          <div
            class='fixed inset-0 z-(--z-modal-backdrop) flex items-center justify-center bg-black/50'
            onClick={close}
            onWheel={(event) => event.preventDefault()}
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          >
            <div
              class='relative z-(--z-modal-content) flex items-center justify-center'
              onClick={(event) => event.stopPropagation()}
              style={{ animation: 'scaleIn 0.2s ease-out' }}
            >
              <div
                class={cn('select-none', isDragging() ? 'cursor-grabbing' : 'cursor-grab')}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDragging(true);
                  dragState = {
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: position().x,
                    originY: position().y,
                  };
                }}
                onWheel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const direction = event.deltaY > 0 ? -1 : 1;
                  setScale((current) =>
                    Math.min(
                      MAX_SCALE,
                      Math.max(MIN_SCALE, Number((current + direction * SCALE_STEP).toFixed(2))),
                    ),
                  );
                }}
                style={{
                  transform: `translate3d(${position().x}px, ${position().y}px, 0) scale(${scale()})`,
                  'transform-origin': 'center',
                }}
              >
                <img
                  src={props.url}
                  alt={props.name}
                  class='pointer-events-none max-h-[80vh] max-w-[80vw] select-none object-contain'
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
