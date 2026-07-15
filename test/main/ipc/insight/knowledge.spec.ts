import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { InsightKnowledgeChannels as KnowledgeChannels } from "@shared/ipc/insight/knowledge.channels";
import type { IpcResponse } from "@shared/types/ipc";

const mocks = vi.hoisted(() => ({
  resolveProjectPath: vi.fn(),
  getKnowledgeBrowser: vi.fn(),
  readKnowledgeEntry: vi.fn(),
  saveKnowledgeEntry: vi.fn(),
  deleteKnowledgeEntry: vi.fn(),
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  resolveProjectPath: mocks.resolveProjectPath,
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
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.readKnowledgeEntry.mockResolvedValue({
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });

    const result = await handler(KnowledgeChannels.readEntry)(
      {},
      {
        projectId: "project-1",
        name: "markstream-vue-theme-subscription",
      }
    );

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.readKnowledgeEntry).toHaveBeenCalledWith(
      "/tmp/project",
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
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.getKnowledgeBrowser.mockResolvedValue({ entries: [], errors: [] });

    const result = await handler(KnowledgeChannels.getBrowser)({}, { projectId: "project-1" });

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.getKnowledgeBrowser).toHaveBeenCalledWith("/tmp/project");
    expect(result).toEqual({ ok: true, data: { entries: [], errors: [] } });
  });

  it("saves raw knowledge markdown for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.saveKnowledgeEntry.mockResolvedValue({
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nUpdated",
    });

    const result = await handler(KnowledgeChannels.saveEntry)(
      {},
      {
        projectId: "project-1",
        name: "markstream-vue-theme-subscription",
        content: "---\nname: markstream-vue-theme-subscription\n---\n\nUpdated",
      }
    );

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.saveKnowledgeEntry).toHaveBeenCalledWith("/tmp/project", {
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
        projectId: "project-1",
        name: "../escape",
      }
    );

    expect(mocks.resolveProjectPath).not.toHaveBeenCalled();
    expect(mocks.readKnowledgeEntry).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("deletes a validated knowledge entry for a resolved project", async () => {
    registerKnowledgeHandlers();
    mocks.resolveProjectPath.mockResolvedValue("/tmp/project");
    mocks.deleteKnowledgeEntry.mockResolvedValue({ name: "entry-name" });

    const result = await handler(KnowledgeChannels.deleteEntry)(
      {},
      { projectId: "project-1", name: "entry-name" }
    );

    expect(mocks.resolveProjectPath).toHaveBeenCalledWith("project-1");
    expect(mocks.deleteKnowledgeEntry).toHaveBeenCalledWith("/tmp/project", "entry-name");
    expect(result).toEqual({ ok: true, data: { name: "entry-name" } });
  });

  it("rejects invalid delete input before resolving the project", async () => {
    registerKnowledgeHandlers();

    const result = await handler(KnowledgeChannels.deleteEntry)(
      {},
      { projectId: "project-1", name: "../escape" }
    );

    expect(mocks.resolveProjectPath).not.toHaveBeenCalled();
    expect(mocks.deleteKnowledgeEntry).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
