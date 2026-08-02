import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowApi } from "@renderer/api/automation/workflow";
import { useWorkflowStore } from "@renderer/stores/automation/workflow";

const workspaceState = vi.hoisted(() => ({
  currentWorkspace: { id: "workspace-a" } as { id: string } | null,
}));

vi.mock("@renderer/api/automation/workflow", () => ({
  workflowApi: { list: vi.fn(), save: vi.fn(), delete: vi.fn() },
}));

vi.mock("@renderer/stores/workspace/workspace", () => ({
  useWorkspaceStore: () => workspaceState,
}));

describe("useWorkflowStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "workspace-a" };
    vi.mocked(workflowApi.list).mockResolvedValue({ ok: true, data: { templates: [] } });
    vi.mocked(workflowApi.save).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(workflowApi.delete).mockResolvedValue({ ok: true, data: undefined });
  });

  it("carries workspaceId on list, save, and delete mutations", async () => {
    const store = useWorkflowStore();
    await store.fetchTemplates();
    await store.saveTemplate("custom", "name: Custom\nstages: []");
    await store.deleteTemplate("custom");

    expect(workflowApi.list).toHaveBeenCalledWith({ workspaceId: "workspace-a" });
    expect(workflowApi.save).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      name: "custom",
      yaml: "name: Custom\nstages: []",
    });
    expect(workflowApi.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      name: "custom",
    });
  });

  it("rejects a late template list from the previous Workspace", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof workflowApi.list>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof workflowApi.list>>) => void;
    vi.mocked(workflowApi.list)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const store = useWorkflowStore();
    const first = store.fetchTemplates("workspace-a");
    workspaceState.currentWorkspace = { id: "workspace-b" };
    const second = store.fetchTemplates("workspace-b");
    resolveSecond({
      ok: true,
      data: {
        templates: [{ id: "current", name: "Current", source: "custom", yaml: "", stages: [] }],
      },
    });
    await second;
    resolveFirst({
      ok: true,
      data: { templates: [{ id: "stale", name: "Stale", source: "custom", yaml: "", stages: [] }] },
    });
    await first;

    expect(store.templates.map((template) => template.id)).toEqual(["current"]);
  });
});
