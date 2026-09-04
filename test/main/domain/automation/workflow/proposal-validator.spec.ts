import { describe, expect, it } from "vitest";
import { validateProposeWorkflowInput } from "@main/domain/automation/workflow/proposal-validator";

function validWorkflow(): string {
  return [
    "name: Generated workflow",
    "version: 2",
    "stages:",
    "  - id: inspect",
    "    kind: agent",
    "    context: fresh",
    "    prompt: Inspect the repository",
    "    produces: { id: result, schema: freeform }",
    "    terminal: true",
  ].join("\n");
}

describe("validateProposeWorkflowInput", () => {
  it("accepts a valid create proposal", () => {
    const result = validateProposeWorkflowInput({
      yaml: validWorkflow(),
      mode: "create",
      persist: "session",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.name).toBe("Generated workflow");
  });

  it("accepts update only when a session shadow or workspace target exists", () => {
    expect(
      validateProposeWorkflowInput(
        { yaml: validWorkflow(), mode: "update", workflowId: "workflow-1", persist: "workspace" },
        { sessionWorkflowExists: true }
      ).ok
    ).toBe(true);
    expect(
      validateProposeWorkflowInput(
        { yaml: validWorkflow(), mode: "update", workflowId: "workflow-1", persist: "session" },
        { workspaceDefinition: { yaml: "existing" } }
      ).ok
    ).toBe(true);
  });

  it("rejects every mode/workflowId/persist combination error", () => {
    const createWithId = validateProposeWorkflowInput({
      yaml: validWorkflow(),
      mode: "create",
      workflowId: "forbidden",
      persist: "session",
    });
    expect(createWithId).toMatchObject({ ok: false });
    if (!createWithId.ok)
      expect(createWithId.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: "mode-workflow-id" })])
      );

    const updateWithoutId = validateProposeWorkflowInput({
      yaml: validWorkflow(),
      mode: "update",
      persist: "workspace",
    });
    expect(updateWithoutId).toMatchObject({ ok: false });

    const missingTarget = validateProposeWorkflowInput({
      yaml: validWorkflow(),
      mode: "update",
      workflowId: "missing",
      persist: "workspace",
    });
    expect(missingTarget).toMatchObject({ ok: false });
    if (!missingTarget.ok) {
      expect(missingTarget.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: "workflow-id" })])
      );
    }

    const invalidPersist = validateProposeWorkflowInput({
      yaml: validWorkflow(),
      mode: "create",
      persist: "database",
    });
    expect(invalidPersist).toMatchObject({ ok: false });
  });

  it("returns structured schema errors and does not throw", () => {
    const result = validateProposeWorkflowInput({
      yaml: "name: [broken",
      mode: "create",
      persist: "session",
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("allows schema-valid features that Phase 1 preflight does not execute", () => {
    const result = validateProposeWorkflowInput({
      yaml: [
        "name: Wait workflow",
        "version: 2",
        "stages:",
        "  - id: wait-for-signal",
        "    kind: wait",
        "    for: manual",
        "    terminal: true",
      ].join("\n"),
      mode: "create",
      persist: "workspace",
    });
    expect(result.ok).toBe(true);
  });
});
