import { describe, expect, it } from "vitest";
import { parseWorkflowYaml } from "@main/domain/workflow/yaml-parser";

describe("parseWorkflowYaml", () => {
  it("parses a minimal workflow with one stage", () => {
    const yaml = [
      "name: Quick Apply",
      "description: short",
      "version: 1",
      "stages:",
      "  - id: apply",
      "    name: 实现",
      "    type: proposal-apply",
      "    agent: claude-acp",
    ].join("\n");

    const result = parseWorkflowYaml(yaml, "quick-apply");
    expect(result.id).toBe("quick-apply");
    expect(result.name).toBe("Quick Apply");
    expect(result.description).toBe("short");
    expect(result.version).toBe(1);
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]).toMatchObject({
      id: "apply",
      name: "实现",
      type: "proposal-apply",
      agent: "claude-acp",
    });
  });

  it("maps legacy `apply` and `archive` stage types to canonical forms", () => {
    const yaml = [
      "stages:",
      "  - id: s1",
      "    type: apply",
      "  - id: s2",
      "    type: archive",
    ].join("\n");
    const result = parseWorkflowYaml(yaml, "legacy");
    expect(result.stages.map((s) => s.type)).toEqual(["proposal-apply", "proposal-archive"]);
  });

  it("coerces unknown stage types to custom", () => {
    const yaml = ["stages:", "  - id: s1", "    type: totally-made-up"].join("\n");
    const result = parseWorkflowYaml(yaml, "legacy");
    expect(result.stages[0].type).toBe("custom");
  });

  it("fills in defaults for missing id/name", () => {
    const yaml = ["stages:", "  - type: proposal-apply", "  - type: proposal-archive"].join("\n");
    const result = parseWorkflowYaml(yaml, "defaults");
    expect(result.stages[0].id).toBe("stage-1");
    expect(result.stages[0].name).toBe("stage-1");
    expect(result.stages[1].id).toBe("stage-2");
  });

  it("handles missing stages and unparsable YAML", () => {
    expect(parseWorkflowYaml("name: Empty", "empty").stages).toEqual([]);
    // Non-object yaml should not throw
    expect(() => parseWorkflowYaml("just a string", "str")).not.toThrow();
  });

  it("parses mcp and skills as string arrays, filtering non-strings", () => {
    const yaml = [
      "stages:",
      "  - id: s1",
      "    type: custom",
      "    mcp:",
      "      - server-a",
      "      - 123",
      "      - null",
      "    skills:",
      "      - fyllo-apply-change",
    ].join("\n");
    const result = parseWorkflowYaml(yaml, "arr");
    expect(result.stages[0].mcp).toEqual(["server-a", "123"]);
    expect(result.stages[0].skills).toEqual(["fyllo-apply-change"]);
  });

  it("accepts numeric or string version values", () => {
    expect(parseWorkflowYaml("version: 2", "a").version).toBe(2);
    expect(parseWorkflowYaml('version: "3"', "a").version).toBe(3);
    expect(parseWorkflowYaml("version: nope", "a").version).toBeUndefined();
  });
});
