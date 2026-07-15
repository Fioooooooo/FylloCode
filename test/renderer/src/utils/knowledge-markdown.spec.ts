import { describe, expect, it } from "vitest";
import { prepareKnowledgeMarkdownForDisplay } from "@renderer/utils/knowledge-markdown";

describe("prepareKnowledgeMarkdownForDisplay", () => {
  it("wraps the complete frontmatter and preserves a body with large arrays", () => {
    const anchors = Array.from({ length: 30 }, (_, index) => `  - file: src/file-${index}.ts`).join(
      "\n"
    );
    const content = `---\nname: entry\nanchors:\n${anchors}\n---\n\n# Body`;

    const result = prepareKnowledgeMarkdownForDisplay(content);

    expect(result.startsWith("```yaml\n---\nname: entry\nanchors:")).toBe(true);
    expect(result).toContain("  - file: src/file-29.ts\n---\n```");
    expect(result.endsWith("\n\n# Body")).toBe(true);
  });

  it("supports BOM and CRLF boundaries", () => {
    const content = "\uFEFF---\r\nname: entry\r\n---\r\n\r\nBody";

    expect(prepareKnowledgeMarkdownForDisplay(content)).toBe(
      "```yaml\n\uFEFF---\r\nname: entry\r\n---\n```\r\n\r\nBody"
    );
  });

  it("uses a longer fence than backtick runs inside frontmatter", () => {
    const content = "---\nexample: ```value```\n---\n\nBody";

    const result = prepareKnowledgeMarkdownForDisplay(content);

    expect(result.startsWith("````yaml\n")).toBe(true);
    expect(result).toContain("\n````\n\nBody");
  });

  it.each(["# Body without frontmatter", "---\nname: missing-closing-boundary\n\nBody"])(
    "passes through content without complete frontmatter",
    (content) => {
      expect(prepareKnowledgeMarkdownForDisplay(content)).toBe(content);
    }
  );
});
