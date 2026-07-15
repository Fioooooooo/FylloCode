import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: { currentProject: { id: "project-1" } as { id: string } | null },
  getBrowser: vi.fn(),
  readEntry: vi.fn(),
  saveEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => mocks.project,
}));

vi.mock("@renderer/api/insight/knowledge", () => ({
  knowledgeApi: {
    getBrowser: mocks.getBrowser,
    readEntry: mocks.readEntry,
    saveEntry: mocks.saveEntry,
    deleteEntry: mocks.deleteEntry,
  },
}));

import { useKnowledgeStore } from "@renderer/stores/insight/knowledge";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useKnowledgeStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.project.currentProject = { id: "project-1" };
  });

  it("loads the current project browser index", async () => {
    const overview = {
      entries: [
        {
          name: "entry",
          description: "Description",
          type: "project" as const,
          updatedAt: "2026-07-01T00:00:00.000Z",
          status: "active" as const,
        },
      ],
      errors: [],
    };
    mocks.getBrowser.mockResolvedValue({ ok: true, data: overview });
    const store = useKnowledgeStore();

    await store.load();

    expect(mocks.getBrowser).toHaveBeenCalledWith("project-1");
    expect(store.data).toEqual(overview);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("records API and thrown errors without stale data", async () => {
    const store = useKnowledgeStore();
    mocks.getBrowser.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "Index failed" },
    });

    await store.load();
    expect(store.data).toBeNull();
    expect(store.error).toBe("Index failed");

    mocks.getBrowser.mockRejectedValueOnce(new Error("Scanner failed"));
    await store.load();
    expect(store.data).toBeNull();
    expect(store.error).toBe("Scanner failed");
  });

  it("ignores a response after the current project changes", async () => {
    const pending = deferred<{
      ok: true;
      data: { entries: []; errors: [] };
    }>();
    mocks.getBrowser.mockReturnValue(pending.promise);
    const store = useKnowledgeStore();

    const loading = store.load("project-1");
    mocks.project.currentProject = { id: "project-2" };
    pending.resolve({ ok: true, data: { entries: [], errors: [] } });
    await loading;

    expect(store.data).toBeNull();
    expect(store.error).toBeNull();
  });

  it("clears browser state and delegates deletion", async () => {
    mocks.getBrowser.mockResolvedValue({ ok: true, data: { entries: [], errors: [] } });
    mocks.deleteEntry.mockResolvedValue({ ok: true, data: { name: "entry" } });
    const store = useKnowledgeStore();
    await store.load();

    const result = await store.deleteEntry("project-1", { name: "entry" });
    expect(mocks.deleteEntry).toHaveBeenCalledWith("project-1", { name: "entry" });
    expect(result).toEqual({ ok: true, data: { name: "entry" } });

    store.clear();
    expect(store.data).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });
});
