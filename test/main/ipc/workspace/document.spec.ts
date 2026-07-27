import { ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";
import type { LocalFilePreviewService } from "@main/services/workspace/document/local-file-preview-service";

const mocks = vi.hoisted(() => ({
  getRequiredProject: vi.fn(),
}));

vi.mock("@main/services/workspace/project/project-service", () => ({
  getRequiredProject: mocks.getRequiredProject,
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
  } as unknown as ProjectWindowManager;
  const service = {
    preparePreview: vi.fn(),
    confirmPreview: vi.fn(),
  } as unknown as LocalFilePreviewService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerDocumentHandlers } = await import("@main/ipc/workspace/document");
    registerDocumentHandlers({ manager, service });
  });

  it("derives project context from the sender before preparing", async () => {
    const sender = { id: 7, once: vi.fn() };
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "project",
      projectId: "project-1",
    });
    mocks.getRequiredProject.mockResolvedValue({ id: "project-1", path: "/project" });
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
      { projectId: "project-1", projectPath: "/project", sender }
    );
  });

  it("rejects launcher senders before loading a project or reading files", async () => {
    vi.mocked(manager.getContextByWebContents).mockReturnValue({
      windowId: 1,
      role: "launcher",
      projectId: null,
    });

    const result = await handler(WorkspaceDocumentChannels.preparePreview)(
      { sender: { id: 7, once: vi.fn() } },
      { requestedPath: "/outside/file.ts" }
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: IpcErrorCodes.PROJECT_REQUIRED,
        message: "本地文件预览需要项目窗口",
      },
    });
    expect(mocks.getRequiredProject).not.toHaveBeenCalled();
    expect(service.preparePreview).not.toHaveBeenCalled();
  });

  it("strictly rejects extra confirmation path and project fields", async () => {
    const result = await handler(WorkspaceDocumentChannels.confirmPreview)(
      { sender: { id: 7, once: vi.fn() } },
      {
        authorizationId: "00000000-0000-4000-8000-000000000001",
        rememberForWindow: true,
        requestedPath: "/outside/other.ts",
        projectId: "project-2",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IpcErrorCodes.VALIDATION_ERROR);
    }
    expect(service.confirmPreview).not.toHaveBeenCalled();
  });
});
