import { describe, expect, it } from "vitest";
import { renderFylloActionPromptContract } from "@shared/fyllo-action/prompt";
import { getFylloActionContract } from "@shared/fyllo-action/registry";

describe("renderFylloActionPromptContract", () => {
  it("renders a stable prompt section", () => {
    const first = renderFylloActionPromptContract();
    const second = renderFylloActionPromptContract();
    expect(first).toBe(second);
    expect(first).toContain("<fyllo-action-contract>");
    expect(first).toContain("</fyllo-action-contract>");
    expect(first).toContain("task.create");
    expect(first).toContain("plan.create");
    expect(first).toContain("knowledge.flag");
    expect(first).toContain("knowledge.review");
    expect(first).toContain("standalone top-level Markdown block");
    expect(first).toContain("inline code or a fenced code block");
  });

  it("includes JSON examples accepted by each action schema", () => {
    const prompt = renderFylloActionPromptContract();
    const examples = Array.from(
      prompt.matchAll(/<fyllo-action type="([^"]+)">\s*(\{[\s\S]*?\})\s*<\/fyllo-action>/g)
    );
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const example of examples) {
      const contract = getFylloActionContract(example[1]);
      const payload = JSON.parse(example[2]);
      expect(contract).toBeDefined();
      expect(contract?.payloadSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("encodes angle bracket rule", () => {
    const prompt = renderFylloActionPromptContract();
    expect(prompt).toContain("\\u003c");
    expect(prompt).toContain("\\u003e");
  });
});
