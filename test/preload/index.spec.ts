import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  },
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  contextBridge: mocks.contextBridge,
  ipcRenderer: mocks.ipcRenderer,
}));

vi.mock("electron-log/renderer", () => ({
  default: mocks.logger,
}));

describe("preload index API shape", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "contextIsolated", {
      configurable: true,
      value: true,
    });
  });

  it("exposes only domain root namespaces", async () => {
    await import("@preload/index");

    expect(mocks.contextBridge.exposeInMainWorld).toHaveBeenCalledOnce();
    const [globalName, api] = mocks.contextBridge.exposeInMainWorld.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(globalName).toBe("api");
    expect(Object.keys(api).sort()).toEqual([
      "automation",
      "insight",
      "platform",
      "proposal",
      "session",
      "workspace",
    ]);
    expect(api).toEqual(
      expect.objectContaining({
        platform: expect.objectContaining({
          app: expect.any(Object),
          settings: expect.any(Object),
          release: expect.any(Object),
          acpAgents: expect.any(Object),
          providers: expect.any(Object),
        }),
        workspace: expect.objectContaining({
          project: expect.any(Object),
          window: expect.any(Object),
        }),
        session: expect.objectContaining({
          chat: expect.any(Object),
        }),
        proposal: expect.objectContaining({
          browser: expect.any(Object),
          apply: expect.any(Object),
          archive: expect.any(Object),
        }),
        insight: expect.objectContaining({
          overview: expect.any(Object),
          specs: expect.any(Object),
          guidelines: expect.any(Object),
          lineage: expect.any(Object),
        }),
        automation: expect.objectContaining({
          workflow: expect.any(Object),
          task: expect.any(Object),
          projectIntegration: expect.any(Object),
        }),
      })
    );
    expect(api).not.toHaveProperty("chat");
    expect(api).not.toHaveProperty("task");
    expect(api).not.toHaveProperty("workflow");
    expect(api).not.toHaveProperty("acpAgents");
    expect(api).not.toHaveProperty("settings");
    expect(api).not.toHaveProperty("project");
    expect(api).not.toHaveProperty("window");
  });
});
