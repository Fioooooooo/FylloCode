import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowApi } from "@renderer/api/automation/workflow";
import { useWorkflowStore } from "@renderer/stores/automation/workflow";
import type { WorkflowDefinitionRecord } from "@shared/types/workflow";

const workspaceState = vi.hoisted(() => ({
  currentWorkspace: { id: "workspace-a" } as { id: string } | null,
}));

vi.mock("@renderer/api/automation/workflow", () => ({
  workflowApi: { list: vi.fn(), save: vi.fn(), delete: vi.fn() },
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => workspaceState,
}));

function record(id: string, name: string): WorkflowDefinitionRecord {
  const definition = {
    name,
    version: 2 as const,
    requires: [] as const,
    confirmStart: false,
    stages: [
      {
        id: "done",
        kind: "action" as const,
        op: { type: "exec" as const, command: "true" },
        confirm: false,
        terminal: true,
      },
    ],
  };
  return {
    workflowId: id,
    name,
    yaml: `name: ${name}\nversion: 2\n`,
    definition,
  };
}

describe("useWorkflowStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "workspace-a" };
    vi.mocked(workflowApi.list).mockResolvedValue({ ok: true, data: { workflows: [] } });
    vi.mocked(workflowApi.save).mockResolvedValue({
      ok: true,
      data: record("workflow-new", "New"),
    });
    vi.mocked(workflowApi.delete).mockResolvedValue({ ok: true, data: undefined });
  });

  it("manages definitions by workflowId and sends only YAML on save", async () => {
    const existing = record("workflow-1", "Existing");
    vi.mocked(workflowApi.list).mockResolvedValueOnce({
      ok: true,
      data: { workflows: [existing] },
    });
    const store = useWorkflowStore();

    await store.fetchDefinitions();
    expect(store.selectedWorkflowId).toBe("workflow-1");
    expect(store.rawYaml).toBe(existing.yaml);

    store.rawYaml = "name: Renamed\nversion: 2\n";
    vi.mocked(workflowApi.save).mockResolvedValueOnce({
      ok: true,
      data: record("workflow-1", "Renamed"),
    });
    await store.saveDefinition();
    expect(workflowApi.save).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      workflowId: "workflow-1",
      yaml: "name: Renamed\nversion: 2\n",
    });

    await store.deleteDefinition();
    expect(workflowApi.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      workflowId: "workflow-1",
    });
    expect(store.workflows).toEqual([]);
  });

  it("creates a v2 draft without a legacy stage generator", () => {
    const store = useWorkflowStore();
    store.startNewWorkflow();
    expect(store.selectedWorkflowId).toBeNull();
    expect(store.rawYaml).toContain("version: 2");
    expect(store.rawYaml).toContain("kind: agent");
    expect(store.rawYaml).not.toContain("type: proposal-apply");
  });

  it("sends no workflowId for a new definition and adopts the returned identity", async () => {
    const store = useWorkflowStore();
    store.startNewWorkflow();
    await store.saveDefinition("name: New\nversion: 2\n");
    expect(workflowApi.save).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      yaml: "name: New\nversion: 2\n",
    });
    expect(store.selectedWorkflowId).toBe("workflow-new");
  });

  it("rejects a late list response from a previous Workspace", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof workflowApi.list>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof workflowApi.list>>) => void;
    vi.mocked(workflowApi.list)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const store = useWorkflowStore();
    const first = store.fetchDefinitions("workspace-a");
    workspaceState.currentWorkspace = { id: "workspace-b" };
    const second = store.fetchDefinitions("workspace-b");
    const current = record("current", "Current");
    resolveSecond({ ok: true, data: { workflows: [current] } });
    await second;
    resolveFirst({ ok: true, data: { workflows: [record("stale", "Stale")] } });
    await first;

    expect(store.workflows.map((workflow) => workflow.workflowId)).toEqual(["current"]);
  });
});
