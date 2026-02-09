"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Quote } from "lucide-react";
import { Button } from "@/shared/ui/button";

type SelectionQuoteButtonProps = {
  text: string;
  rect: DOMRect | null;
  onQuote: () => void;
};

export function SelectionQuoteButton({
  text,
  rect,
  onQuote,
}: SelectionQuoteButtonProps) {
  const hasSelection = Boolean(text && rect);
  const top = rect ? rect.bottom + 8 : 0;
  const left = rect ? rect.left + rect.width / 2 : 0;

  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, delay: 0.3 }}
          className="fixed z-(--z-draggable)"
          style={{ top, left, transform: "translateX(-50%)" }}
          data-selection-quote-button
        >
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="引用选中文本"
            onClick={onQuote}
            className="h-8 w-8 rounded-full shadow-md"
          >
            <Quote className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
