"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CodeBlockProps = {
  language?: string;
  code?: string;
  className?: string;
  children: ReactNode;
};

const normalizeLanguage = (language?: string) => {
  if (!language) return "";
  const match = language.match(/language-([\w-]+)/);
  const raw = match?.[1] ?? language.trim().split(/\s+/)[0];
  return raw.toLowerCase();
};

export default function CodeBlock({
  language,
  code = "",
  className,
  children,
}: CodeBlockProps) {
  const normalizedLanguage = normalizeLanguage(language);
  const hasCode = code.trim().length > 0;

  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    if (!hasCode || typeof navigator === "undefined") return;

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy code:", error);
    }
  };


  return (
    <div className="group relative w-full max-w-full overflow-hidden rounded-lg border bg-muted/50">
      {/* Sticky copy button */}
      <div className="sticky top-2 float-right mr-2 mt-2 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title="复制到剪贴板"
          aria-label="复制到剪贴板"
          disabled={!hasCode}
          className="h-7 gap-1 px-2 text-[11px] bg-transparent"
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isCopied ? "已复制" : "复制"}
          </span>
        </Button>
      </div>

      {/* Language label */}
      <div className="px-3 py-2 ">
        {normalizedLanguage ? (
          <span className="text-xs font-medium text-muted-foreground">
            {normalizedLanguage.toUpperCase()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Code</span>
        )}
      </div>
      {/* Code area */}
      <pre
        className={cn(
          className,
          "max-w-full overflow-x-auto rounded-none bg-transparent p-4 text-sm"
        )}
      >
        {children}
      </pre>
    </div>
  );
}
