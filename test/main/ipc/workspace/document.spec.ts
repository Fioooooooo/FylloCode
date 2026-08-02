import { ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import type { LocalFilePreviewService } from "@main/services/workspace/document/local-file-preview-service";

const mocks = vi.hoisted(() => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("@main/services/workspace/_public", () => ({
  resolveWorkspace: mocks.resolveWorkspace,
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
    mocks.resolveWorkspace.mockResolvedValue({ workspaceId: "workspace-1", cwd: "/project" });
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
      { workspaceId: "workspace-1", folderPath: "/project", sender }
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
    mocks.resolveWorkspace.mockResolvedValue({ workspaceId: "workspace-2", cwd: "/other" });
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
      folderPath: "/other",
      sender,
    });
  });
});
