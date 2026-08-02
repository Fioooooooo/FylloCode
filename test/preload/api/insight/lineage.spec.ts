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

    await lineageApi.readPlan("workspace-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    await lineageApi.savePlanBody("workspace-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      body: "body",
    });
    await lineageApi.approvePlan("workspace-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.readPlan, {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.savePlanBody, {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      body: "body",
    });
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.approvePlan, {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
  });

  it("invokes the browser channel with the project id", async () => {
    const { lineageApi } = await import("@preload/api/insight/lineage");

    await lineageApi.getBrowser("workspace-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(LineageChannels.getBrowser, {
      workspaceId: "workspace-1",
    });
  });
});
