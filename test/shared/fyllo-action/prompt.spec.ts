import { describe, expect, it } from "vitest";
import { renderFylloActionPromptContract } from "@shared/fyllo-action/prompt";

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
  });

  it("includes valid JSON examples", () => {
    const prompt = renderFylloActionPromptContract();
    const examples =
      prompt.match(/<fyllo-action type="[^"]+">\s*\{[\s\S]*?\}\s*<\/fyllo-action>/g) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const example of examples) {
      const jsonMatch = example.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      expect(() => JSON.parse(jsonMatch![0])).not.toThrow();
    }
  });

  it("encodes angle bracket rule", () => {
    const prompt = renderFylloActionPromptContract();
    expect(prompt).toContain("\\u003c");
    expect(prompt).toContain("\\u003e");
  });
});
