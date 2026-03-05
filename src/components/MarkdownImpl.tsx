import { useEffect } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { splitMarkdownParagraphs } from "@/lib/markdown";

const KATEX_CSS_VERSION = "0.16.33";

function loadKatexCSS() {
  if (document.querySelector('link[href*="katex.min.css"]'))
    return Promise.resolve();

  return new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://cdn.jsdelivr.net/npm/katex@${KATEX_CSS_VERSION}/dist/katex.min.css`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

const MATH_PATTERN = /\$\$|\\\(|\\\[/;

type Props = {
  content: string;
  isAnimating?: boolean;
};

const codePlugin = createCodePlugin({
  themes: ["github-light", "github-dark"],
});

const plugins = { code: codePlugin, math, cjk };

function MarkdownImpl({ content, isAnimating = false }: Props) {
  useEffect(() => {
    if (MATH_PATTERN.test(content)) {
      loadKatexCSS();
    }
  }, [content]);

  const paragraphs = splitMarkdownParagraphs(content);

  return (
    <div className="space-y-3">
      {paragraphs.map((paragraph, i) => (
        <Streamdown
          key={i}
          plugins={plugins}
          rehypePlugins={[
            defaultRehypePlugins.sanitize,
            defaultRehypePlugins.harden,
          ]}
          isAnimating={isAnimating && i === paragraphs.length - 1}
        >
          {paragraph}
        </Streamdown>
      ))}
    </div>
  );
}

export default MarkdownImpl;
