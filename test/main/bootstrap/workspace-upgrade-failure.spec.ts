import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  openPath: vi.fn(),
  quit: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => (name === "logs" ? "/app/logs" : "")),
    quit: mocks.quit,
  },
  dialog: { showMessageBox: mocks.showMessageBox },
  shell: { openPath: mocks.openPath },
}));

vi.mock("@main/infra/logger", () => ({
  default: { error: mocks.loggerError },
}));

import { showWorkspaceUpgradeFailure } from "@main/bootstrap/workspace-upgrade-failure";

describe("Workspace upgrade failure UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });
    mocks.openPath.mockResolvedValue("");
  });

  it("shows the blocking failure copy and exits directly", async () => {
    await showWorkspaceUpgradeFailure({
      migrationId: "20260804_001_retire-legacy-project-storage",
      reason: "target incomplete",
    });

    expect(mocks.showMessageBox).toHaveBeenCalledWith({
      type: "error",
      title: "Workspace 数据升级失败",
      message: "Workspace 数据升级失败",
      detail: expect.stringMatching(
        /无法确认归属的旧 Project 数据不会被删除。[\s\S]*下次启动会自动重试 Workspace settlement。[\s\S]*20260804_001_retire-legacy-project-storage[\s\S]*\/app\/logs[\s\S]*target incomplete/
      ),
      buttons: ["打开日志目录", "退出 FylloCode"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  it("opens the logs directory before exiting", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });

    await showWorkspaceUpgradeFailure({ migrationId: "migration-id" });

    expect(mocks.openPath).toHaveBeenCalledWith("/app/logs");
    expect(mocks.openPath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.quit.mock.invocationCallOrder[0]
    );
  });

  it("treats closing the dialog as Exit FylloCode", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });

    await showWorkspaceUpgradeFailure({ migrationId: "migration-id" });

    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  it("still exits when opening the logs directory fails", async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
    mocks.openPath.mockResolvedValue("permission denied");

    await showWorkspaceUpgradeFailure({ migrationId: "migration-id" });

    expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  it("still exits when the native dialog itself fails", async () => {
    mocks.showMessageBox.mockRejectedValue(new Error("dialog unavailable"));

    await showWorkspaceUpgradeFailure({ migrationId: "migration-id" });

    expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("dialog unavailable"));
    expect(mocks.quit).toHaveBeenCalledOnce();
  });
});
