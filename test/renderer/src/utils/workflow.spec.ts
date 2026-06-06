import { describe, expect, it } from "vitest";
import { parseStageType, parseWorkflowYaml, STAGE_TEMPLATES } from "@renderer/utils/workflow";

describe("workflow utils", () => {
  it("normalizes legacy and unknown stage types", () => {
    expect(parseStageType("apply")).toBe("proposal-apply");
    expect(parseStageType("archive")).toBe("proposal-archive");
    expect(parseStageType("code-review")).toBe("code-review");
    expect(parseStageType("unknown")).toBe("custom");
  });

  it("parses workflow yaml into a rendered model", () => {
    const yaml = [
      "name: Demo",
      "description: Example workflow",
      "version: 2",
      "stages:",
      "  - id: stage-1",
      "    name: Apply",
      "    type: apply",
      "    agent: codex",
      "    prompt: Do the thing",
      "    mcp:",
      "      - fs",
      "    skills:",
      "      - openspec-apply-change",
    ].join("\n");

    const result = parseWorkflowYaml(yaml, "Fallback");

    expect(result).toEqual({
      name: "Demo",
      description: "Example workflow",
      version: "2",
      stages: [
        {
          id: "stage-1",
          name: "Apply",
          type: "proposal-apply",
          agent: "codex",
          prompt: "Do the thing",
          when: undefined,
          onFailure: undefined,
          mcp: ["fs"],
          skills: ["openspec-apply-change"],
        },
      ],
    });
  });

  it("provides templates for every stage type", () => {
    expect(Object.keys(STAGE_TEMPLATES).sort()).toEqual(
      [
        "code-review",
        "create-pr",
        "custom",
        "proposal-apply",
        "proposal-archive",
        "security-check",
      ].sort()
    );

    expect(STAGE_TEMPLATES["proposal-apply"].agent).toBeUndefined();
  });

  it("falls back for malformed yaml", () => {
    const result = parseWorkflowYaml("name: [broken", "Fallback");
    expect(result.name).toBe("Fallback");
    expect(result.description).toBe("YAML 格式有误");
    expect(result.stages).toEqual([]);
  });
});
