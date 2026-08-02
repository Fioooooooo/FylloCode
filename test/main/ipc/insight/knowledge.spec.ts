import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightKnowledgeChannels as KnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceCwd: vi.fn(),
  getKnowledgeBrowser: vi.fn(),
  readKnowledgeEntry: vi.fn(),
  saveKnowledgeEntry: vi.fn(),
  deleteKnowledgeEntry: vi.fn(),
  getContextByWebContents: vi.fn(),
}));

vi.mock("@main/bootstrap/workspace-window-manager", () => ({
  workspaceWindowManager: {
    getContextByWebContents: mocks.getContextByWebContents,
  },
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  resolveWorkspaceCwd: mocks.resolveWorkspaceCwd,
}));

vi.mock("@main/services/insight/knowledge/knowledge-document-service", () => ({
  getKnowledgeBrowser: mocks.getKnowledgeBrowser,
  readKnowledgeEntry: mocks.readKnowledgeEntry,
  saveKnowledgeEntry: mocks.saveKnowledgeEntry,
  deleteKnowledgeEntry: mocks.deleteKnowledgeEntry,
}));

import { registerKnowledgeHandlers } from "@main/ipc/insight/knowledge";

describe("registerKnowledgeHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-1",
    });
  });

  function handler(
    channel: string
  ): (event: unknown, input: unknown) => Promise<IpcResponse<unknown>> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.slice()
      .reverse()
      .find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<IpcResponse<unknown>>;
  }

  it("reads a raw knowledge markdown entry for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveWorkspaceCwd.mockResolvedValue("/tmp/project");
    mocks.readKnowledgeEntry.mockResolvedValue({
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });

    const result = await handler(KnowledgeChannels.readEntry)(
      {},
      {
        workspaceId: "workspace-1",
        name: "markstream-vue-theme-subscription",
      }
    );

    expect(mocks.resolveWorkspaceCwd).not.toHaveBeenCalled();
    expect(mocks.readKnowledgeEntry).toHaveBeenCalledWith(
      "workspace-1",
      "markstream-vue-theme-subscription"
    );
    expect(result).toEqual({
      ok: true,
      data: {
        name: "markstream-vue-theme-subscription",
        content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
      },
    });
  });

  it("loads the knowledge browser for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveWorkspaceCwd.mockResolvedValue("/tmp/project");
    mocks.getKnowledgeBrowser.mockResolvedValue({ entries: [], errors: [] });

    const result = await handler(KnowledgeChannels.getBrowser)({}, { workspaceId: "workspace-1" });

    expect(mocks.resolveWorkspaceCwd).toHaveBeenCalledWith("workspace-1");
    expect(mocks.getKnowledgeBrowser).toHaveBeenCalledWith("workspace-1", "/tmp/project");
    expect(result).toEqual({ ok: true, data: { entries: [], errors: [] } });
  });

  it("saves raw knowledge markdown for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveWorkspaceCwd.mockResolvedValue("/tmp/project");
    mocks.saveKnowledgeEntry.mockResolvedValue({
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nUpdated",
    });

    const result = await handler(KnowledgeChannels.saveEntry)(
      {},
      {
        workspaceId: "workspace-1",
        name: "markstream-vue-theme-subscription",
        content: "---\nname: markstream-vue-theme-subscription\n---\n\nUpdated",
      }
    );

    expect(mocks.resolveWorkspaceCwd).not.toHaveBeenCalled();
    expect(mocks.saveKnowledgeEntry).toHaveBeenCalledWith("workspace-1", {
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nUpdated",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid input before resolving the project", async () => {
    registerKnowledgeHandlers();

    const result = await handler(KnowledgeChannels.readEntry)(
      {},
      {
        workspaceId: "workspace-1",
        name: "../escape",
      }
    );

    expect(mocks.resolveWorkspaceCwd).not.toHaveBeenCalled();
    expect(mocks.readKnowledgeEntry).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("deletes a validated knowledge entry for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveWorkspaceCwd.mockResolvedValue("/tmp/project");
    mocks.deleteKnowledgeEntry.mockResolvedValue({ name: "entry-name" });

    const result = await handler(KnowledgeChannels.deleteEntry)(
      {},
      { workspaceId: "workspace-1", name: "entry-name" }
    );

    expect(mocks.resolveWorkspaceCwd).not.toHaveBeenCalled();
    expect(mocks.deleteKnowledgeEntry).toHaveBeenCalledWith("workspace-1", "entry-name");
    expect(result).toEqual({ ok: true, data: { name: "entry-name" } });
  });

  it("rejects invalid delete input before resolving the project", async () => {
    registerKnowledgeHandlers();

    const result = await handler(KnowledgeChannels.deleteEntry)(
      {},
      { workspaceId: "workspace-1", name: "../escape" }
    );

    expect(mocks.resolveWorkspaceCwd).not.toHaveBeenCalled();
    expect(mocks.deleteKnowledgeEntry).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("rejects knowledge access from a different Workspace window", async () => {
    registerKnowledgeHandlers();
    mocks.getContextByWebContents.mockReturnValue({
      role: "workspace",
      workspaceId: "workspace-2",
    });

    const result = await handler(KnowledgeChannels.getBrowser)(
      { sender: { id: 12 } },
      { workspaceId: "workspace-1" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
    });
    expect(mocks.getKnowledgeBrowser).not.toHaveBeenCalled();
  });
});
