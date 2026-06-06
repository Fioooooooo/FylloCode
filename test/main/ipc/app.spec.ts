import { app, BrowserWindow, ipcMain } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { AppChannels } from "@shared/types/channels";
import logger from "@main/infra/logger";

describe("registerAppHandlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { registerAppHandlers } = await import("@main/ipc/app");
    registerAppHandlers();
  });

  function handler(channel: string): (event: unknown, input: unknown) => Promise<unknown> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input: unknown) => Promise<unknown>;
  }

  it("opens devtools for the sender window", async () => {
    const openDevTools = vi.fn();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      webContents: { openDevTools },
    } as unknown as BrowserWindow);

    const sender = {};
    const result = await handler(AppChannels.openDevTools)({ sender }, {});

    expect(result).toEqual({ ok: true, data: undefined });
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(sender);
    expect(openDevTools).toHaveBeenCalledWith({ mode: "detach" });
  });

  it("rejects invalid payloads through validation", async () => {
    const result = await handler(AppChannels.openDevTools)({ sender: {} }, { unexpected: true });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.VALIDATION_ERROR,
      }),
    });
  });

  it("persists renderer error reports through the main logger", async () => {
    const report = {
      source: "vue",
      message: "Open folder failed",
      timestamp: "2026-05-26T03:00:00.000Z",
      name: "Error",
      stack: "Error: Open folder failed",
      info: "component event handler",
      route: "/",
    };

    const result = await handler(AppChannels.reportRendererError)({ sender: {} }, report);

    expect(result).toEqual({ ok: true, data: undefined });
    expect(logger.error).toHaveBeenCalledWith("[renderer:vue] Open folder failed", report);
  });

  it("rejects invalid renderer error reports through validation", async () => {
    const result = await handler(AppChannels.reportRendererError)(
      { sender: {} },
      { source: "vue", timestamp: "2026-05-26T03:00:00.000Z" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.VALIDATION_ERROR,
      }),
    });
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining("[renderer:"),
      expect.anything()
    );
  });

  it("returns the current userData path", async () => {
    vi.mocked(app.getPath).mockReturnValue("/tmp/fyllocode-test");

    const result = await handler(AppChannels.getUserDataPath)({ sender: {} }, undefined);

    expect(result).toEqual({ ok: true, data: "/tmp/fyllocode-test" });
    expect(app.getPath).toHaveBeenCalledWith("userData");
  });
});
