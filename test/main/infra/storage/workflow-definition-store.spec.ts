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
} from "@main/infra/storage/workflow-definition-store";
import {
  workflowDefinitionPath,
  workflowDir,
  workflowRunsDir,
} from "@main/infra/storage/workspace-paths";

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-workflow-definition-"));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

describe("workflow-definition-store", () => {
  it("updates a definition in place and preserves its workflow run root", async () => {
    await saveWorkflowDefinition("workspace-a", "workflow-1", "name: First\nversion: 2\n");
    await saveWorkflowDefinition("workspace-a", "workflow-1", "name: Renamed\nversion: 2\n");

    await expect(loadWorkflowDefinition("workspace-a", "workflow-1")).resolves.toEqual({
      workflowId: "workflow-1",
      yaml: "name: Renamed\nversion: 2\n",
    });
    expect(await readFile(workflowDefinitionPath("workspace-a", "workflow-1"), "utf8")).toBe(
      "name: Renamed\nversion: 2\n"
    );
    expect(workflowDir("workspace-a", "workflow-1")).toContain("workflow-1");

    const runMarker = join(workflowRunsDir("workspace-a", "workflow-1"), "run-1", "run.txt");
    await mkdir(join(runMarker, ".."), { recursive: true });
    await writeFile(runMarker, "keep", "utf8");
    await deleteWorkflowDefinition("workspace-a", "workflow-1");

    await expect(loadWorkflowDefinition("workspace-a", "workflow-1")).resolves.toBeNull();
    await expect(readFile(runMarker, "utf8")).resolves.toBe("keep");
  });

  it("lists only workflow directories and ignores legacy name-based YAML files", async () => {
    await saveWorkflowDefinition("workspace-a", "workflow-1", "name: One\nversion: 2\n");
    await mkdir(join(paths.root, "workspaces", "workspace-a", "workflows"), { recursive: true });
    await writeFile(
      join(paths.root, "workspaces", "workspace-a", "workflows", "legacy-name.yaml"),
      "name: Legacy\n",
      "utf8"
    );

    await expect(listWorkflowDefinitions("workspace-a")).resolves.toEqual([
      { workflowId: "workflow-1", yaml: "name: One\nversion: 2\n" },
    ]);
  });

  it("keeps definitions isolated between Workspaces", async () => {
    await saveWorkflowDefinition("workspace-a", "same-id", "name: A\nversion: 2\n");
    await saveWorkflowDefinition("workspace-b", "same-id", "name: B\nversion: 2\n");

    await expect(loadWorkflowDefinition("workspace-a", "same-id")).resolves.toMatchObject({
      yaml: "name: A\nversion: 2\n",
    });
    await expect(loadWorkflowDefinition("workspace-b", "same-id")).resolves.toMatchObject({
      yaml: "name: B\nversion: 2\n",
    });
  });
});
