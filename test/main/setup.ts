/**
 * Vitest setup for the `main` project.
 *
 * Electron modules are not available in a plain Node test environment. We
 * stub them with the minimum surface the main-process code touches during
 * unit tests (typically just `BrowserWindow.getAllWindows()`, `app.getPath`,
 * and `MessageChannelMain`). Tests that need real behaviour should mock the
 * specific function they exercise.
 */

import { vi } from "vitest";

vi.mock("electron", () => {
  class MessagePortMainStub {
    postMessage = vi.fn();
    close = vi.fn();
    start = vi.fn();
    on = vi.fn();
    once = vi.fn();
    removeListener = vi.fn();
  }
  class MessageChannelMainStub {
    port1 = new MessagePortMainStub();
    port2 = new MessagePortMainStub();
  }
  return {
    app: {
      getPath: vi.fn(() => "/tmp/fyllocode-test"),
      getAppPath: vi.fn(() => "/tmp/fyllocode-test"),
      getVersion: vi.fn(() => "0.0.0-test"),
      on: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
      exit: vi.fn(),
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
      fromWebContents: vi.fn(() => null),
    },
    dialog: { showOpenDialog: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    net: { fetch: vi.fn() },
    shell: { openExternal: vi.fn() },
    MessageChannelMain: MessageChannelMainStub,
  };
});

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
  platform: { isMacOS: false, isLinux: false, isWindows: false },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
}));

vi.mock("electron-log/main", () => ({
  default: {
    transports: {
      file: { resolvePathFn: null },
      console: { level: "silly" },
    },
    errorHandler: { startCatching: vi.fn() },
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
