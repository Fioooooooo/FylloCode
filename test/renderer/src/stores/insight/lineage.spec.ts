import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LineageBrowserData } from "@shared/types/lineage";

const mocks = vi.hoisted(() => ({
  getBrowser: vi.fn(),
}));

vi.mock("@renderer/api/insight/lineage", () => ({
  lineageApi: {
    getBrowser: mocks.getBrowser,
    ensureTaskSubject: vi.fn(),
    linkTaskSession: vi.fn(),
    getByTask: vi.fn(),
    getBySession: vi.fn(),
    createSessionTask: vi.fn(),
    readPlan: vi.fn(),
    savePlanBody: vi.fn(),
    approvePlan: vi.fn(),
  },
}));

import { useLineageStore } from "@renderer/stores/insight/lineage";

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

describe("useLineageStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads browser data without deriving entry state in the renderer", async () => {
    const data = {
      entries: [
        {
          subjectId: "subject-1",
          origin: "chat" as const,
          task: null,
          status: "applying" as const,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
          sessions: [],
        },
      ],
    };
    mocks.getBrowser.mockResolvedValue({ ok: true, data });
    const store = useLineageStore();

    await store.loadBrowser("project-1");

    expect(mocks.getBrowser).toHaveBeenCalledWith("project-1");
    expect(store.browserData).toEqual(data);
    expect(store.browserData?.entries[0]?.status).toBe("applying");
    expect(store.browserLoading).toBe(false);
    expect(store.browserError).toBeNull();
  });

  it("keeps successful empty data distinct from API and thrown failures", async () => {
    const store = useLineageStore();
    mocks.getBrowser.mockResolvedValueOnce({ ok: true, data: { entries: [] } });
    await store.loadBrowser("project-1");
    expect(store.browserData).toEqual({ entries: [] });

    mocks.getBrowser.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN_ERROR", message: "Browser failed" },
    });
    await store.loadBrowser("project-1");
    expect(store.browserData).toBeNull();
    expect(store.browserError).toBe("Browser failed");

    mocks.getBrowser.mockImplementationOnce(() => {
      throw new Error("Transport failed");
    });
    await store.loadBrowser("project-1");
    expect(store.browserData).toBeNull();
    expect(store.browserError).toBe("Transport failed");
  });

  it("ignores an older response after a newer project request resolves", async () => {
    const first = deferred<{ ok: true; data: LineageBrowserData }>();
    const secondData: LineageBrowserData = { entries: [] };
    mocks.getBrowser
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true, data: secondData });
    const store = useLineageStore();

    const firstLoad = store.loadBrowser("project-1");
    await store.loadBrowser("project-2");
    first.resolve({
      ok: true,
      data: {
        entries: [
          {
            subjectId: "stale",
            origin: "chat",
            task: null,
            status: "discussion",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
            sessions: [],
          },
        ],
      },
    });
    await firstLoad;

    expect(store.browserData).toEqual(secondData);
    expect(store.browserLoading).toBe(false);
  });

  it("clears state and invalidates an in-flight response", async () => {
    const pending = deferred<{ ok: true; data: LineageBrowserData }>();
    mocks.getBrowser.mockReturnValue(pending.promise);
    const store = useLineageStore();

    const loading = store.loadBrowser("project-1");
    store.clearBrowser();
    pending.resolve({ ok: true, data: { entries: [] } });
    await loading;

    expect(store.browserData).toBeNull();
    expect(store.browserLoading).toBe(false);
    expect(store.browserError).toBeNull();
  });
});
