import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from '@/frontend/design-system/icons';
import { cn } from '@/shared/core/utils';
import { formatFileSize } from '@/frontend/browser/file';

export type ImagePreviewProps = {
  url: string;
  name: string;
  size: number;
  className?: string;
  uploading?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.1;

export function ImagePreview({ url, name, size, className, uploading = false }: ImagePreviewProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const backdrop = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragState.current) return;
      setPosition({
        x: dragState.current.originX + event.clientX - dragState.current.startX,
        y: dragState.current.originY + event.clientY - dragState.current.startY,
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      dragState.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen, isDragging]);

  useEffect(() => {
    if (!isOpen || !backdrop.current || !image.current) return;

    const preventPageWheel = (event: WheelEvent) => event.preventDefault();
    const zoomImage = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      setScale((current) =>
        Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, Number((current + direction * SCALE_STEP).toFixed(2))),
        ),
      );
    };

    const currentBackdrop = backdrop.current;
    const currentImage = image.current;
    currentBackdrop.addEventListener('wheel', preventPageWheel, { passive: false });
    currentImage.addEventListener('wheel', zoomImage, { passive: false });
    return () => {
      currentBackdrop.removeEventListener('wheel', preventPageWheel);
      currentImage.removeEventListener('wheel', zoomImage);
    };
  }, [isOpen]);

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    dragState.current = null;
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
          if (uploading) return;
          resetView();
          setIsOpen(true);
        }}
        className={cn(
          'relative h-20 w-20 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        title={`${name} (${formatFileSize(size)})`}
        aria-label={uploading ? `上传中 ${name}` : `预览图片 ${name}`}
      >
        <img
          src={url}
          alt={name}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loadedUrl === url ? 'opacity-100' : 'opacity-0',
          )}
          draggable={false}
          onLoad={() => setLoadedUrl(url)}
        />
        {uploading ? (
          <span className='absolute inset-0 flex items-center justify-center bg-black/30'>
            <Loader2 className='h-6 w-6 animate-spin text-white' aria-hidden />
          </span>
        ) : null}
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={backdrop}
              className='fixed inset-0 z-(--z-modal-backdrop) flex items-center justify-center bg-black/50'
              onClick={close}
              style={{ animation: 'fadeIn 0.2s ease-out' }}
            >
              <div
                className='relative z-(--z-modal-content) flex items-center justify-center'
                onClick={(event) => event.stopPropagation()}
                style={{ animation: 'scaleIn 0.2s ease-out' }}
              >
                <div
                  ref={image}
                  className={cn('select-none', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsDragging(true);
                    dragState.current = {
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: position.x,
                      originY: position.y,
                    };
                  }}
                  style={{
                    transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                    transformOrigin: 'center',
                  }}
                >
                  <img
                    src={url}
                    alt={name}
                    className='pointer-events-none max-h-[80vh] max-w-[80vw] select-none object-contain'
                    draggable={false}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
