import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposalBrowserApi } from "@renderer/api/proposal/browser";
import { useProposalStore } from "@renderer/stores/proposal/browser";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import type { ProposalBrowserOverview, ProposalMeta } from "@shared/types/proposal";
import { workspaceInfo } from "../../fixtures/workspace";

vi.mock("@renderer/api/proposal/browser", () => ({
  proposalBrowserApi: {
    list: vi.fn(),
    watch: vi.fn(),
    onStatusChanged: vi.fn(),
  },
}));

function proposal(folderId: string, changeId: string): ProposalMeta {
  return {
    id: changeId,
    proposalRef: { folderId, changeId },
    folderName: folderId === "folder-a" ? "Repository A" : "Repository B",
    title: changeId,
    status: "draft",
    why: "why",
    totalTasks: 1,
    doneTasks: 0,
    hasDesign: false,
    date: "2026-08-02",
    worktreeMode: "main",
    worktreePath: `/repos/${folderId}`,
  };
}

function overview(label = "change"): ProposalBrowserOverview {
  const primary = proposal("folder-a", `${label}-a`);
  const secondary = proposal("folder-b", `${label}-b`);
  return {
    folders: [
      {
        folderId: "folder-a",
        folderName: "Repository A",
        folderPath: "/repos/a",
        isPrimary: true,
        status: "ready",
        items: [primary],
        warnings: [],
      },
      {
        folderId: "folder-b",
        folderName: "Repository B",
        folderPath: "/repos/b",
        isPrimary: false,
        status: "ready",
        items: [secondary],
        warnings: [],
      },
    ],
    items: [primary, secondary],
    completeness: "complete",
    excludedFolderIds: [],
  };
}

function setWorkspace(id: string): void {
  useWorkspaceStore().currentWorkspace = workspaceInfo({
    id,
    name: id,
    folderPath: `/repos/${id}`,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    lastOpenedAt: new Date("2026-06-10T00:00:00.000Z"),
  });
}

describe("useProposalStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    setWorkspace("workspace-a");
  });

  it("retains the aggregate while filtering visible proposals by owner", async () => {
    vi.mocked(proposalBrowserApi.list).mockResolvedValue({ ok: true, data: overview() });
    const store = useProposalStore();

    await store.loadProposals("workspace-a");
    store.setFolderFilter("folder-b");

    expect(store.proposals).toHaveLength(2);
    expect(store.visibleProposals.map((item) => item.proposalRef.folderId)).toEqual(["folder-b"]);
    expect(store.folders).toHaveLength(2);
  });

  it("clears the Folder filter with the store", async () => {
    vi.mocked(proposalBrowserApi.list).mockResolvedValue({ ok: true, data: overview() });
    const store = useProposalStore();
    await store.loadProposals("workspace-a");
    store.setFolderFilter("folder-b");

    store.clear();

    expect(store.selectedFolderId).toBeNull();
    expect(store.data).toBeNull();
    expect(store.proposals).toEqual([]);
  });

  it("rejects a late aggregate response from the previous Workspace", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof proposalBrowserApi.list>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof proposalBrowserApi.list>>) => void;
    vi.mocked(proposalBrowserApi.list)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const store = useProposalStore();
    const firstLoad = store.loadProposals("workspace-a");

    setWorkspace("workspace-b");
    const secondLoad = store.loadProposals("workspace-b");
    resolveSecond({ ok: true, data: overview("current") });
    await secondLoad;
    resolveFirst({ ok: true, data: overview("stale") });
    await firstLoad;

    expect(store.proposals.map((item) => item.id)).toEqual(["current-a", "current-b"]);
  });
});
