import { describe, expect, it } from "vitest";
import { analyzeFylloSignalMarkdown } from "@shared/fyllo-signal/parser";
import { renderFylloSignalPromptContract } from "@shared/fyllo-signal/prompt";
import { enabledFylloSignalTypes, getFylloSignalContract } from "@shared/fyllo-signal/registry";

describe("renderFylloSignalPromptContract", () => {
  it("renders deterministic protocol-only guidance", () => {
    const prompt = renderFylloSignalPromptContract();

    expect(prompt).toBe(renderFylloSignalPromptContract());
    expect(prompt).toContain("<fyllo-signal-contract>");
    expect(prompt).toContain("</fyllo-signal-contract>");
    expect(prompt).toContain("standalone top-level Markdown block");
    expect(prompt).toContain("blank line (two newline characters)");
    expect(prompt).toContain("never append the opening tag to a prose line");
    expect(prompt).toContain("inline code or a fenced code block");
    expect(prompt).toContain("\\u003c");
    expect(prompt).toContain("\\u003e");
    expect(prompt).toContain("passive display markers");
    expect(prompt).toContain("require no user action");
    expect(prompt).toContain("do not appear in the session event rail");
    expect(prompt).not.toMatch(/Vue|Markstream|Nuxt|Tailwind|renderer/);
  });

  it("renders one standalone executable example per enabled type", () => {
    const prompt = renderFylloSignalPromptContract();
    const analysis = analyzeFylloSignalMarkdown(prompt);

    expect(analysis.occurrences).toHaveLength(enabledFylloSignalTypes.length);
    expect(
      analysis.occurrences.every(
        (occurrence) => occurrence.closed && occurrence.disposition === "candidate"
      )
    ).toBe(true);
  });

  it("renders examples accepted by their registered schemas", () => {
    const prompt = renderFylloSignalPromptContract();
    const examples = Array.from(
      prompt.matchAll(/<fyllo-signal type="([^"]+)">\s*(\{[\s\S]*?\})\s*<\/fyllo-signal>/g)
    );

    expect(examples).toHaveLength(enabledFylloSignalTypes.length);
    for (const example of examples) {
      const contract = getFylloSignalContract(example[1]);
      expect(contract).toBeDefined();
      expect(contract?.payloadSchema.safeParse(JSON.parse(example[2])).success).toBe(true);
    }
  });
});
