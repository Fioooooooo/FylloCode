import { ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import type { LocalFilePreviewService } from "@main/services/workspace/document/local-file-preview-service";

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
  getRequiredWorkspaceInfo: vi.fn(),
  assertSessionBelongsToWorkspace: vi.fn(),
  ensureSessionWorkspaceSnapshot: vi.fn(),
}));

vi.mock("@main/services/workspace/_public", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
  getRequiredWorkspaceInfo: mocks.getRequiredWorkspaceInfo,
}));

vi.mock("@main/services/session/chat/chat-service", () => ({
  assertSessionBelongsToWorkspace: mocks.assertSessionBelongsToWorkspace,
  ensureSessionWorkspaceSnapshot: mocks.ensureSessionWorkspaceSnapshot,
}));

function handler(channel: string) {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  expect(call).toBeTruthy();
  return call![1] as unknown as (
    event: { sender: { id: number; once: ReturnType<typeof vi.fn> } },
    input: unknown
  ) => Promise<IpcResponse<unknown>>;
}

describe("registerDocumentHandlers", () => {
  const manager = {
    getContextByWebContents: vi.fn(),
  } as unknown as WorkspaceWindowManager;
  const service = {
    preparePreview: vi.fn(),
    confirmPreview: vi.fn(),
  } as unknown as LocalFilePreviewService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.assertSessionBelongsToWorkspace.mockResolvedValue(undefined);
    mocks.ensureSessionWorkspaceSnapshot.mockResolvedValue({
      workspaceId: "workspace-1",
      workspaceKind: "folder",
      primaryFolderId: "folder-1",
      folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/project" }],
      cwd: "/project",
      additionalDirectories: [],
    });
    const { registerDocumentHandlers } = await import("@main/ipc/workspace/document");
    registerDocumentHandlers({ manager, service });
  });

  it("derives Workspace context from the sender before preparing", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-1",
    });
    const availableFolders = [
      {
        folderId: "folder-1",
        folderName: "Project",
        folderPath: "/project",
        pathMissing: false,
      },
    ];
    mocks.resolveWorkspace.mockResolvedValue({
      workspaceId: "workspace-1",
      cwd: "/project",
      availableFolders,
    });
    vi.mocked(service.preparePreview).mockResolvedValue({
      status: "error",
      code: "FILE_NOT_FOUND",
      message: "missing",
    });

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender },
      { requestedPath: "/project/missing.ts" }
    );

    expect(result.ok).toBe(true);
    expect(service.preparePreview).toHaveBeenCalledWith(
      { requestedPath: "/project/missing.ts" },
      { workspaceId: "workspace-1", availableFolders, sender }
    );
  });

  it("rejects launcher senders before resolving a Workspace or reading files", async () => {
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "launcher",
      workspaceId: null,
    });

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender: { id: 7, once: vi.fn() } },
      { requestedPath: "/outside/file.ts" }
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: IpcErrorCodes.WORKSPACE_REQUIRED,
        message: "本地文件预览需要 Workspace 窗口",
      },
    });
    expect(mocks.resolveWorkspace).not.toHaveBeenCalled();
    expect(service.preparePreview).not.toHaveBeenCalled();
  });

  it("strictly rejects extra confirmation path and project fields", async () => {
    const result = await handler(WorkspaceDocumentChannels.confirmPreview)(
      { sender: { id: 7, once: vi.fn() } },
      {
        authorizationId: "00000000-0000-4000-8000-000000000001",
        rememberForWindow: true,
        requestedPath: "/outside/other.ts",
        workspaceId: "workspace-2",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IpcErrorCodes.VALIDATION_ERROR);
    }
    expect(service.confirmPreview).not.toHaveBeenCalled();
  });

  it("re-resolves the sender Workspace before confirming", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-2",
    });
    const availableFolders = [
      {
        folderId: "folder-2",
        folderName: "Other",
        folderPath: "/other",
        pathMissing: false,
      },
    ];
    mocks.resolveWorkspace.mockResolvedValue({
      workspaceId: "workspace-2",
      cwd: "/other",
      availableFolders,
    });
    vi.mocked(service.confirmPreview).mockResolvedValue({
      status: "error",
      code: "AUTHORIZATION_INVALID",
      message: "mismatch",
    });

    const input = {
      authorizationId: "00000000-0000-4000-8000-000000000001",
      rememberForWindow: true,
    };
    const result = await handler(WorkspaceDocumentChannels.confirmPreview)({ sender }, input);

    expect(result.ok).toBe(true);
    expect(service.confirmPreview).toHaveBeenCalledWith(input, {
      workspaceId: "workspace-2",
      availableFolders,
      sender,
    });
  });

  it("rejects a Session comparison context outside the sender Workspace", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-1",
    });
    mocks.assertSessionBelongsToWorkspace.mockRejectedValue(
      Object.assign(new Error("Session does not belong to Workspace"), {
        code: IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
      })
    );

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender },
      { requestedPath: "/project/app.ts", sessionId: "session-from-other-workspace" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED }),
    });
    expect(service.preparePreview).not.toHaveBeenCalled();
  });

  it("marks a member-owned ready result authorized for a matching Session snapshot", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-1",
    });
    mocks.resolveWorkspace.mockResolvedValue({
      workspaceId: "workspace-1",
      availableFolders: [],
    });
    vi.mocked(service.preparePreview).mockResolvedValue({
      status: "ready",
      document: {
        requestedPath: "/project/app.ts",
        canonicalPath: "/project/app.ts",
        content: "code",
        language: "typescript",
        size: 4,
        mtimeMs: 1,
        owner: { folderId: "folder-1", worktreePath: "/project" },
      },
    });

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender },
      { requestedPath: "/project/app.ts", sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ status: "ready", agentScope: "authorized" }),
    });
    expect(mocks.ensureSessionWorkspaceSnapshot).toHaveBeenCalledWith("workspace-1", "session-1");
  });

  it("keeps an external exact-path grant window-only without fabricating an owner", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "workspace",
      workspaceId: "workspace-1",
    });
    mocks.resolveWorkspace.mockResolvedValue({
      workspaceId: "workspace-1",
      availableFolders: [],
    });
    vi.mocked(service.preparePreview).mockResolvedValue({
      status: "ready",
      document: {
        requestedPath: "/outside/app.ts",
        canonicalPath: "/outside/app.ts",
        content: "code",
        language: "typescript",
        size: 4,
        mtimeMs: 1,
      },
    });

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender },
      { requestedPath: "/outside/app.ts", sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ status: "ready", agentScope: "window-only" }),
    });
    expect(mocks.ensureSessionWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
