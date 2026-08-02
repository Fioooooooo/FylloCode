import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsightKnowledgeChannels as KnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe("preload knowledgeApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription", content: "---\nname: test\n---\n" },
    });
  });

  it("invokes readEntry with project and entry name", async () => {
    const { knowledgeApi } = await import("@preload/api/insight/knowledge");

    await knowledgeApi.readEntry("workspace-1", {
      name: "markstream-vue-theme-subscription",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(KnowledgeChannels.readEntry, {
      workspaceId: "workspace-1",
      name: "markstream-vue-theme-subscription",
    });
  });

  it("invokes getBrowser with the project id", async () => {
    const { knowledgeApi } = await import("@preload/api/insight/knowledge");

    await knowledgeApi.getBrowser("workspace-1");

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(KnowledgeChannels.getBrowser, {
      workspaceId: "workspace-1",
    });
  });

  it("invokes saveEntry with raw markdown content", async () => {
    const { knowledgeApi } = await import("@preload/api/insight/knowledge");

    await knowledgeApi.saveEntry("workspace-1", {
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(KnowledgeChannels.saveEntry, {
      workspaceId: "workspace-1",
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });
  });

  it("invokes deleteEntry with project and entry name", async () => {
    const { knowledgeApi } = await import("@preload/api/insight/knowledge");

    await knowledgeApi.deleteEntry("workspace-1", {
      name: "markstream-vue-theme-subscription",
    });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(KnowledgeChannels.deleteEntry, {
      workspaceId: "workspace-1",
      name: "markstream-vue-theme-subscription",
    });
  });
});
