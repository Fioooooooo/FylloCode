import { describe, expect, it } from "vitest";
import {
  parseWorkflowYaml,
  validateWorkflowDefinition,
  WorkflowDefinitionValidationError,
} from "@main/domain/automation/workflow/yaml-parser";

function validWorkflow(overrides = ""): string {
  return [
    "name: Demo",
    "version: 2",
    "stages:",
    "  - id: prepare",
    "    kind: agent",
    "    prompt: Inspect the repository",
    "    produces: { id: result, schema: freeform }",
    "    next: [{ on: pass, goto: finish }]",
    "  - id: finish",
    "    kind: action",
    '    op: { type: exec, command: "true" }',
    "    terminal: true",
    overrides,
  ]
    .filter(Boolean)
    .join("\n");
}

function issuesOf(yaml: string) {
  try {
    parseWorkflowYaml(yaml);
    throw new Error("expected parser to reject definition");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowDefinitionValidationError);
    return (error as WorkflowDefinitionValidationError).issues;
  }
}

describe("parseWorkflowYaml", () => {
  it("parses and normalizes a complete v2 definition without a fallback name", () => {
    const result = parseWorkflowYaml(validWorkflow());

    expect(result).toMatchObject({
      name: "Demo",
      version: 2,
      requires: [],
      confirmStart: false,
    });
    expect(result.stages).toEqual([
      expect.objectContaining({
        id: "prepare",
        kind: "agent",
        context: "fresh",
        prompt: "Inspect the repository",
        produces: { id: "result", schema: "freeform" },
      }),
      expect.objectContaining({
        id: "finish",
        kind: "action",
        confirm: true,
        terminal: true,
      }),
    ]);
  });

  it("does not coerce legacy stage aliases or malformed YAML", () => {
    expect(issuesOf(["name: Legacy", "version: 1", "stages: []"].join("\n"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "version" })])
    );
    expect(
      issuesOf(["name: Legacy", "version: 2", "stages:", "  - type: apply"].join("\n"))
    ).toEqual(expect.arrayContaining([expect.objectContaining({ field: "stages[0].kind" })]));
    expect(issuesOf("name: [broken")).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "yaml" })])
    );
  });

  it("enforces graph shape, references, and artifact/gate relationships", () => {
    const issues = issuesOf(
      [
        "name: Invalid",
        "version: 2",
        "stages:",
        "  - id: first",
        "    kind: agent",
        "    prompt: '{{unknown.value}}'",
        "    produces: { id: text, schema: freeform }",
        "    gate: { type: verdict, maxSeverity: medium }",
        "    next: [{ on: pass, goto: missing }]",
        "  - id: unreachable",
        "    kind: agent",
        "    prompt: text",
        "    produces: { id: other, schema: freeform }",
        "    terminal: true",
      ].join("\n")
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "template-namespace", stageId: "first" }),
        expect.objectContaining({ refs: ["missing"] }),
        expect.objectContaining({ feature: "verdict", stageId: "first" }),
        expect.objectContaining({ stageId: "unreachable" }),
      ])
    );
  });

  it("requires maxLoops on cyclic transitions and rejects missing artifact references", () => {
    const issues = issuesOf(
      [
        "name: Loop",
        "version: 2",
        "stages:",
        "  - id: first",
        "    kind: agent",
        "    prompt: text",
        "    produces: { id: text, schema: freeform }",
        "    gate: { type: expr, expr: 'artifacts.missing.value == 1' }",
        "    next: [{ on: pass, goto: first }]",
      ].join("\n")
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "maxLoops", stageId: "first" }),
        expect.objectContaining({ feature: "artifact-reference", refs: ["missing"] }),
        expect.objectContaining({ feature: "terminal" }),
      ])
    );
  });

  it("keeps inherit definitions schema-valid only when chat is declared", () => {
    const withoutChat = issuesOf(
      [
        "name: Inherit",
        "version: 2",
        "stages:",
        "  - id: agent",
        "    kind: agent",
        "    context: inherit",
        "    prompt: use chat",
        "    produces: { id: result, schema: freeform }",
        "    terminal: true",
      ].join("\n")
    );
    expect(withoutChat).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: "context.inherit" })])
    );
    expect(
      parseWorkflowYaml(
        [
          "name: Inherit",
          "version: 2",
          "requires: [chat]",
          "stages:",
          "  - id: agent",
          "    kind: agent",
          "    context: inherit",
          "    prompt: use {{chat.summary}}",
          "    produces: { id: result, schema: freeform }",
          "    terminal: true",
        ].join("\n")
      ).requires
    ).toEqual(["chat"]);
  });

  it("requires idempotency keys for external Action ops", () => {
    const issues = issuesOf(
      [
        "name: External",
        "version: 2",
        "stages:",
        "  - id: pr",
        "    kind: action",
        "    op: { type: scm.open-pr, title: Title, base: main }",
        "    terminal: true",
      ].join("\n")
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "stages[0].idempotencyKey", feature: "idempotencyKey" }),
      ])
    );
  });

  it("accepts the normalized object contract directly", () => {
    expect(
      validateWorkflowDefinition({
        name: "Direct",
        version: 2,
        stages: [
          {
            id: "done",
            kind: "action",
            op: { type: "exec", command: "true" },
            terminal: true,
          },
        ],
      })
    ).toMatchObject({ name: "Direct", version: 2, stages: [{ id: "done" }] });
  });
});
