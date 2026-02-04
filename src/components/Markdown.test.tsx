import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Markdown from "./Markdown";

describe("Markdown code rendering", () => {
  it("renders inline code with inline styles and fenced code without them", () => {
    const content = `Inline \`code\`

\`\`\`
block no lang
\`\`\`
`;

    const { container } = render(<Markdown content={content} />);

    const inlineCode = screen.getByText("code", { selector: "code" });
    expect(inlineCode.className).toContain("bg-(--code-inline-bg)");
    expect(inlineCode.closest("pre")).toBeNull();

    const blockCode = screen.getByText(/block no lang/i, { selector: "code" });
    expect(blockCode.className).not.toContain("bg-(--code-inline-bg)");
    expect(blockCode.closest("pre")).not.toBeNull();

    const preTags = container.querySelectorAll("pre");
    expect(preTags.length).toBeGreaterThan(0);
  });
});
