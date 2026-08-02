import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe("preload documentApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ipcRenderer.invoke.mockResolvedValue({ ok: true, data: null });
  });

  it("prepares a preview with only the requested path", async () => {
    const { documentApi } = await import("@preload/api/workspace/document");

    await documentApi.preparePreview({ requestedPath: "/project/src/app.ts:12:3" });

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      WorkspaceDocumentChannels.preparePreview,
      { requestedPath: "/project/src/app.ts:12:3" }
    );
  });

  it("confirms a preview with the authorization choice", async () => {
    const { documentApi } = await import("@preload/api/workspace/document");
    const input = {
      authorizationId: "0d369330-3498-4bed-a181-a37ab473052c",
      rememberForWindow: true,
    };

    await documentApi.confirmPreview(input);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      WorkspaceDocumentChannels.confirmPreview,
      input
    );
  });

  it("forwards Session comparison context without adding Workspace authority fields", async () => {
    const { documentApi } = await import("@preload/api/workspace/document");
    const input = {
      requestedPath: "/project/src/app.ts",
      sessionId: "session-1",
    };

    await documentApi.preparePreview(input);

    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
      WorkspaceDocumentChannels.preparePreview,
      input
    );
  });
});
