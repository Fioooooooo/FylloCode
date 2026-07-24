import { describe, expect, it } from "vitest";
import { analyzeFylloActionMarkdown } from "@shared/fyllo-action/parser";
import { renderFylloActionPromptContract } from "@shared/fyllo-action/prompt";
import {
  enabledFylloActionTypes,
  fylloActionContracts,
  getFylloActionContract,
} from "@shared/fyllo-action/registry";

function renderLegacyActionPromptContract(): string {
  const contracts = Object.values(fylloActionContracts);
  const actionContracts = contracts
    .map((contract) => {
      const example = JSON.stringify(contract.prompt.example, null, 2);
      return [
        `- ${contract.type}`,
        `  Purpose: ${contract.prompt.purpose}`,
        `  Required fields: ${
          contract.prompt.payloadFields
            .filter((field) => field.required)
            .map((field) => field.name)
            .join(", ") || "none"
        }`,
        `  Optional fields: ${
          contract.prompt.payloadFields
            .filter((field) => !field.required)
            .map((field) => field.name)
            .join(", ") || "none"
        }`,
        "  Constraints:",
        ...contract.prompt.constraints.map((constraint) => `    - ${constraint}`),
        "  Executable output example (emit without Markdown fences and keep the surrounding blank lines):",
        "",
        `<fyllo-action type="${contract.type}">`,
        ...example.split("\n"),
        "</fyllo-action>",
        "",
      ].join("\n");
    })
    .join("\n");

  return [
    "<fyllo-action-contract>",
    "Rules:",
    "- Only emit enabled action types.",
    "- The only allowed attribute is type.",
    "- The body must be a strict JSON object matching the enabled type schema.",
    "- Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.",
    "- When payload text needs literal angle brackets, encode them as \\u003c and \\u003e inside JSON strings.",
    "- Emit a real action only as a standalone top-level Markdown block starting at the beginning of a line; indenting it four or more spaces turns it into a code block.",
    "- If prose precedes the action, insert a blank line (two newline characters) before the opening tag; never append the opening tag to a prose line.",
    "- After the closing tag, either end the response or insert a blank line before continuing; never append further text to the closing-tag line.",
    "- When explaining the public tag syntax or showing a non-executable example, wrap it in inline code or a fenced code block.",
    "",
    `Enabled action types: ${contracts.map((contract) => contract.type).join(", ")}.`,
    "",
    actionContracts,
    "</fyllo-action-contract>",
  ].join("\n");
}

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
    expect(first).toContain("blank line (two newline characters)");
    expect(first).toContain("never append the opening tag to a prose line");
    expect(first).toContain("leave a blank line after the closing tag");
    expect(first).toContain("inline code or a fenced code block");
  });

  it("preserves the pre-refactor output byte for byte", () => {
    expect(renderFylloActionPromptContract()).toBe(renderLegacyActionPromptContract());
  });

  it("renders executable examples with standalone block boundaries", () => {
    const analysis = analyzeFylloActionMarkdown(renderFylloActionPromptContract());

    expect(analysis.occurrences).toHaveLength(enabledFylloActionTypes.length);
    expect(
      analysis.occurrences.every(
        (occurrence) => occurrence.closed && occurrence.disposition === "candidate"
      )
    ).toBe(true);
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
