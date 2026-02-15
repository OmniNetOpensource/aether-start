"use client";

import { isValidElement, memo, useEffect, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import CodeBlock from "@/shared/components/CodeBlock";
import { cn } from "@/shared/lib/utils";

type Props = {
  content: string;
};

const extractLanguage = (className?: string) => {
  if (!className) return "";
  const match = className.match(/language-([\w-]+)/);
  if (match) return match[1];
  return className.trim().split(/\s+/)[0];
};

const extractCodeFromNode = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map(extractCodeFromNode).join("");
  }
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return extractCodeFromNode(element.props.children);
  }
  return "";
};

const remarkPlugins = [remarkGfm, remarkMath];
type RehypePlugins = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
>;

let rehypePluginsPromise: Promise<RehypePlugins> | null = null;

const loadRehypePlugins = () => {
  if (!rehypePluginsPromise) {
    rehypePluginsPromise = Promise.all([
      import("rehype-katex").then((module) => module.default),
      import("rehype-highlight").then((module) => module.default),
    ]);
  }
  return rehypePluginsPromise;
};

const components: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ className, ...props }) => (
    <h1
      {...props}
      className={cn(
        "mt-8 mb-4 first:mt-0 last:mb-0 text-xl font-bold leading-snug tracking-tight text-foreground",
        className
      )}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      {...props}
      className={cn(
        "mt-7 mb-3 first:mt-0 last:mb-0 text-lg font-semibold leading-snug text-foreground",
        className
      )}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      {...props}
      className={cn(
        "mt-6 mb-2.5 first:mt-0 last:mb-0 text-base font-semibold text-foreground",
        className
      )}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      {...props}
      className={cn(
        "mt-5 mb-2 first:mt-0 last:mb-0 text-sm font-semibold text-foreground",
        className
      )}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      {...props}
      className={cn(
        "mb-4 last:mb-0 leading-[1.75] text-(--text-secondary)",
        className
      )}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      {...props}
      className={cn(
        "mb-4 last:mb-0 pl-6 space-y-1.5 text-(--text-secondary) list-none",
        "[&>li]:relative [&>li]:before:absolute [&>li]:before:-left-4 [&>li]:before:top-[0.6em] [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:rounded-full [&>li]:before:bg-(--content-accent) [&>li]:before:opacity-70",
        "[&_ul]:mt-1.5 [&_ul]:mb-0 [&_ul>li]:before:h-1 [&_ul>li]:before:w-1 [&_ul>li]:before:bg-muted-foreground",
        "[&_ul_ul>li]:before:rounded-none [&_ul_ul>li]:before:h-0.5 [&_ul_ul>li]:before:w-2",
        className
      )}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      {...props}
      className={cn(
        "mb-4 last:mb-0 pl-6 space-y-1.5 text-(--text-secondary) list-none [counter-reset:list-counter]",
        "[&>li]:relative [&>li]:[counter-increment:list-counter] [&>li]:before:absolute [&>li]:before:-left-6 [&>li]:before:w-5 [&>li]:before:text-right [&>li]:before:content-[counter(list-counter)_'.'] [&>li]:before:text-xs [&>li]:before:font-medium [&>li]:before:text-(--content-accent) [&>li]:before:opacity-80",
        "[&_ol]:mt-1.5 [&_ol]:mb-0 [&_ol>li]:before:text-muted-foreground",
        className
      )}
    />
  ),
  li: ({ className, ...props }) => (
    <li
      {...props}
      className={cn("leading-[1.7] text-current pl-1", className)}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      {...props}
      className={cn(
        "my-4 last:mb-0 border-l-[3px] border-[color-mix(in_srgb,var(--content-accent),transparent_60%)] bg-(--surface-muted)/50 rounded-r-lg pl-4 pr-3 py-2.5 text-(--text-secondary) italic",
        className
      )}
    />
  ),
  hr: ({ className, ...props }) => (
    <div
      {...props}
      role="separator"
      className={cn('my-6 last:mb-0', className)}
    >
      <svg
        viewBox="0 0 400 6"
        preserveAspectRatio="none"
        className="w-full h-1.5"
      >
        <path
          d="M0 3 C10 1.5, 30 4.5, 50 3 C70 1.5, 90 5, 110 2.5 C130 0.5, 150 4.5, 170 3 C190 1.5, 210 4.5, 230 3 C250 1.5, 270 5, 290 2.5 C310 1, 330 4.5, 350 3 C370 1.5, 390 4.5, 400 3"
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  ),
  strong: ({ className, ...props }) => (
    <strong
      {...props}
      className={cn("font-semibold text-foreground", className)}
    />
  ),
  em: ({ className, ...props }) => (
    <em {...props} className={cn("text-foreground italic", className)} />
  ),
  a: ({ className, ...props }) => (
    <a
      {...props}
      className={cn(
        "text-ring font-medium hand-drawn-underline hover:text-(--interactive-primary-hover) transition-colors",
        className
      )}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  pre: ({ className, children }) => {
    const childArray = Array.isArray(children) ? children : [children];
    const codeElement = childArray.find(
      (
        child
      ): child is ReactElement<{
        className?: string;
        children?: ReactNode;
      }> => isValidElement(child)
    );

    const language = extractLanguage(codeElement?.props.className || className);
    const rawCode = extractCodeFromNode(
      codeElement?.props.children ?? children
    );

    return (
      <div className="my-4 last:mb-0 first:mt-0">
        <CodeBlock language={language} code={rawCode} className={className}>
          {children}
        </CodeBlock>
      </div>
    );
  },
  code: ({ className, node, children, ...props }) => {
    const rawCode = extractCodeFromNode(children);
    const startLine = node?.position?.start?.line;
    const endLine = node?.position?.end?.line;
    const hasLineSpan = Boolean(startLine && endLine);
    const isInline = hasLineSpan ? startLine === endLine : !rawCode.includes("\n");
    if (isInline) {
      return (
        <code
          {...props}
          className={cn(
            className,
            "rounded-md bg-(--code-inline-bg) ring-1 ring-border px-1.5 py-0.5 font-mono text-[0.85em] text-foreground font-medium"
          )}
        >
          {children}
        </code>
      );
    }
    return (
      <code {...props} className={cn(className, "bg-transparent")}>
        {children}
      </code>
    );
  },
  table: ({ className, ...props }) => (
    <div className="my-4 last:mb-0 first:mt-0 overflow-x-auto rounded-lg border border-border">
      <table
        {...props}
        className={cn("w-full border-collapse text-left text-sm", className)}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      {...props}
      className={cn(
        "border-b border-border bg-(--surface-muted) px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-(--text-secondary)",
        className
      )}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      {...props}
      className={cn(
        "border-b border-border px-4 py-2.5 align-top text-(--text-secondary)",
        className
      )}
    />
  ),
};

const Markdown = memo(function Markdown({ content }: Props) {
  const [rehypePlugins, setRehypePlugins] = useState<RehypePlugins>([]);

  useEffect(() => {
    let isMounted = true;
    loadRehypePlugins()
      .then((plugins) => {
        if (isMounted) {
          setRehypePlugins(plugins);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRehypePlugins([]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="markdown-body text-sm leading-relaxed text-(--text-secondary)">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
