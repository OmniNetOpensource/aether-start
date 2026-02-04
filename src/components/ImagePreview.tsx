"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/src/lib/utils/file";

type ImagePreviewProps = {
  url: string;
  name: string;
  size: number;
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.1;

export function ImagePreview({
  url,
  name,
  size,
  className,
}: ImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    dragStateRef.current = null;
  };

  const handleOpen = () => {
    resetView();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetView();
  };

  const clampScale = (value: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY > 0 ? -1 : 1;
    setScale((prev) =>
      clampScale(Number((prev + direction * SCALE_STEP).toFixed(2)))
    );
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  useEffect(() => {
    if (!isOpen || !isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      setPosition({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isOpen, isDragging]);

  const sizeLabel = formatFileSize(size);
  const previewLabel = `${name} (${sizeLabel})`;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "relative h-20 w-20 overflow-hidden rounded-xl",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--interactive-primary)/60",
          className
        )}
        title={previewLabel}
        aria-label={`预览图片 ${name}`}
      >
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </button>

      {isOpen &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className="fixed inset-0 z-(--z-modal-backdrop) flex items-center justify-center bg-black/70"
                onClick={handleClose}
                onWheel={(event) => event.preventDefault()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <motion.div
                  className="relative z-(--z-modal-content) flex items-center justify-center"
                  onClick={(event) => event.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div
                    className={cn(
                      "select-none",
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    )}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={handleMouseDown}
                    onWheel={handleWheel}
                    style={{
                      transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                      transformOrigin: "center",
                    }}
                  >
                    <img
                      src={url}
                      alt={name}
                      className="pointer-events-none max-h-[80vh] max-w-[80vw] select-none object-contain"
                      draggable={false}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
