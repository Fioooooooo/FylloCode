import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ root: "" }));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (subPath: string) => join(paths.root, subPath),
}));

import {
  deleteWorkflowDefinition,
  listWorkflowDefinitions,
  loadWorkflowDefinition,
  saveWorkflowDefinition,
} from "@main/services/automation/workflow/workflow-service";
import {
  workflowDefinitionPath,
  workflowRunsDir,
  workflowsDir,
} from "@main/infra/storage/workspace-paths";

function yaml(name: string): string {
  return [
    `name: ${name}`,
    "version: 2",
    "stages:",
    "  - id: done",
    "    kind: action",
    '    op: { type: exec, command: "true" }',
    "    terminal: true",
    "",
  ].join("\n");
}

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-workflow-service-"));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

describe("WorkflowDefinitionService", () => {
  it("allocates a random workflowId and updates the same asset on rename", async () => {
    const created = await saveWorkflowDefinition({
      workspaceId: "workspace-a",
      yaml: yaml("First"),
    });
    expect(created.workflowId).toMatch(/^workflow-/);
    const definitionPath = workflowDefinitionPath("workspace-a", created.workflowId);

    await saveWorkflowDefinition({
      workspaceId: "workspace-a",
      workflowId: created.workflowId,
      yaml: yaml("Renamed"),
    });
    expect(await readFile(definitionPath, "utf8")).toBe(yaml("Renamed"));
    await expect(loadWorkflowDefinition("workspace-a", created.workflowId)).resolves.toMatchObject({
      workflowId: created.workflowId,
      name: "Renamed",
    });
  });

  it("lists only valid Workspace definitions and never global staging", async () => {
    const saved = await saveWorkflowDefinition({ workspaceId: "workspace-a", yaml: yaml("Saved") });
    await mkdir(workflowsDir("workspace-a"), { recursive: true });
    await writeFile(join(workflowsDir("workspace-a"), "legacy.yaml"), yaml("Legacy"), "utf8");
    await mkdir(join(paths.root, "workflows"), { recursive: true });
    await writeFile(join(paths.root, "workflows", "global.yaml"), yaml("Global"), "utf8");

    await expect(listWorkflowDefinitions("workspace-a")).resolves.toEqual({
      workflows: [expect.objectContaining({ workflowId: saved.workflowId, name: "Saved" })],
    });
  });

  it("validates before saving and deletes by workflowId only", async () => {
    const saved = await saveWorkflowDefinition({ workspaceId: "workspace-a", yaml: yaml("Good") });
    await expect(
      saveWorkflowDefinition({
        workspaceId: "workspace-a",
        workflowId: saved.workflowId,
        yaml: "name: broken\nversion: 1\n",
      })
    ).rejects.toMatchObject({ code: "WORKFLOW_DEFINITION_INVALID" });
    await expect(
      readFile(workflowDefinitionPath("workspace-a", saved.workflowId), "utf8")
    ).resolves.toBe(yaml("Good"));

    const marker = join(workflowRunsDir("workspace-a", saved.workflowId), "run-1", "run.json");
    await mkdir(join(marker, ".."), { recursive: true });
    await writeFile(marker, "run", "utf8");
    await deleteWorkflowDefinition({ workspaceId: "workspace-a", workflowId: saved.workflowId });
    await expect(loadWorkflowDefinition("workspace-a", saved.workflowId)).resolves.toBeNull();
    await expect(readFile(marker, "utf8")).resolves.toBe("run");
  });
});
