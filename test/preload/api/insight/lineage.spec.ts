import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsightLineageChannels as LineageChannels } from "@shared/ipc/insight/lineage.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe("preload lineageApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("invokes plan channels with structured identifiers", async () => {
    const { lineageApi } = await import("@preload/api/insight/lineage");

    await lineageApi.readPlan("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    await lineageApi.savePlanBody("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      body: "body",
    });
    await lineageApi.approvePlan("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.readPlan, {
      projectId: "project-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.savePlanBody, {
      projectId: "project-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      body: "body",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.approvePlan, {
      projectId: "project-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
  });

  it("invokes the browser channel with the project id", async () => {
    const { lineageApi } = await import("@preload/api/insight/lineage");

    await lineageApi.getBrowser("project-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.getBrowser, {
      projectId: "project-1",
    });
  });
});
