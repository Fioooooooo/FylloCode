import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot, mocks } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-workflow-service-"),
    mocks: { listBuiltInWorkflowFileNames: vi.fn() },
  };
});

vi.mock("@main/infra/storage/workspace-paths", () => ({
  workflowsDir: (workspaceId: string) => join(tempRoot, "workspaces", workspaceId, "workflows"),
}));

vi.mock("@main/services/automation/workflow/built-in-loader", () => ({
  getUserWorkflowDirectory: () => join(tempRoot, "global-workflows"),
  listBuiltInWorkflowFileNames: mocks.listBuiltInWorkflowFileNames,
}));

import {
  deleteWorkflow,
  listWorkflows,
  saveWorkflow,
} from "@main/services/automation/workflow/workflow-service";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  mocks.listBuiltInWorkflowFileNames.mockResolvedValue(["built-in.yaml"]);
});

afterEach(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("workflow-service Workspace ownership", () => {
  it("lists global built-ins and only the requested Workspace custom workflows", async () => {
    mkdirSync(join(tempRoot, "global-workflows"), { recursive: true });
    mkdirSync(join(tempRoot, "workspaces", "workspace-a", "workflows"), { recursive: true });
    mkdirSync(join(tempRoot, "workspaces", "workspace-b", "workflows"), { recursive: true });
    writeFileSync(
      join(tempRoot, "global-workflows", "built-in.yaml"),
      "name: Built In\nstages: []\n",
      "utf8"
    );
    writeFileSync(
      join(tempRoot, "global-workflows", "legacy-custom.yaml"),
      "name: Legacy Global Custom\nstages: []\n",
      "utf8"
    );
    writeFileSync(
      join(tempRoot, "workspaces", "workspace-a", "workflows", "custom-a.yaml"),
      "name: Custom A\nstages: []\n",
      "utf8"
    );
    writeFileSync(
      join(tempRoot, "workspaces", "workspace-b", "workflows", "custom-b.yaml"),
      "name: Custom B\nstages: []\n",
      "utf8"
    );

    const result = await listWorkflows("workspace-a");

    expect(result.templates.map((template) => template.name)).toEqual(["Custom A", "Built In"]);
    expect(result.templates.map((template) => template.source)).toEqual(["custom", "built-in"]);
  });

  it("saves and deletes only inside the requested Workspace data directory", async () => {
    await saveWorkflow({
      workspaceId: "workspace-a",
      name: "custom",
      yaml: "name: Custom\nstages: []\n",
    });

    expect(
      readFileSync(join(tempRoot, "workspaces", "workspace-a", "workflows", "custom.yaml"), "utf8")
    ).toContain("name: Custom");
    await deleteWorkflow({ workspaceId: "workspace-a", name: "custom" });
    await expect(listWorkflows("workspace-a")).resolves.toMatchObject({ templates: [] });
  });
});
