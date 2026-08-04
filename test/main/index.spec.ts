import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  mkdirSync: vi.fn(),
  setPath: vi.fn(),
  requestSingleInstanceLock: vi.fn(),
  quit: vi.fn(),
  appOn: vi.fn(),
  startApp: vi.fn(),
  requestWindowAttention: vi.fn(),
}));

vi.mock("node:fs", () => ({
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged;
    },
    setPath: mocks.setPath,
    requestSingleInstanceLock: mocks.requestSingleInstanceLock,
    quit: mocks.quit,
    on: mocks.appOn,
  },
}));

vi.mock("@main/bootstrap", () => ({
  startApp: mocks.startApp,
}));

describe("main entry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mocks.isPackaged = true;
    mocks.requestSingleInstanceLock.mockReturnValue(true);
    mocks.startApp.mockReturnValue({
      requestWindowAttention: mocks.requestWindowAttention,
    });
  });

  it("keeps the default Electron userData path in packaged mode", async () => {
    await import("@main/index");

    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.setPath).not.toHaveBeenCalled();
    expect(mocks.requestSingleInstanceLock).toHaveBeenCalledOnce();
  });

  it("binds dev userData to the current worktree before requesting the lock", async () => {
    const callOrder: string[] = [];
    const expectedPath = join(process.cwd(), "data");
    mocks.isPackaged = false;
    mocks.mkdirSync.mockImplementation(() => {
      callOrder.push("mkdir-dev-data");
    });
    mocks.setPath.mockImplementation(() => {
      callOrder.push("set-user-data");
    });
    mocks.requestSingleInstanceLock.mockImplementation(() => {
      callOrder.push("single-instance-lock");
      return true;
    });
    mocks.startApp.mockImplementation(() => {
      callOrder.push("start-bootstrap");
      return { requestWindowAttention: mocks.requestWindowAttention };
    });

    await import("@main/index");
    await vi.waitFor(() => expect(mocks.startApp).toHaveBeenCalledOnce());

    expect(mocks.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    expect(mocks.setPath).toHaveBeenCalledWith("userData", expectedPath);
    expect(callOrder).toEqual([
      "mkdir-dev-data",
      "set-user-data",
      "single-instance-lock",
      "start-bootstrap",
    ]);
  });

  it("uses a stable dev userData path for repeated starts in the same worktree", async () => {
    mocks.isPackaged = false;

    await import("@main/index");
    await vi.waitFor(() => expect(mocks.startApp).toHaveBeenCalledOnce());
    vi.resetModules();
    await import("@main/index");
    await vi.waitFor(() => expect(mocks.startApp).toHaveBeenCalledTimes(2));

    const expectedPath = join(process.cwd(), "data");
    expect(mocks.setPath).toHaveBeenNthCalledWith(1, "userData", expectedPath);
    expect(mocks.setPath).toHaveBeenNthCalledWith(2, "userData", expectedPath);
  });

  it("fails before locking or bootstrap when the dev userData path cannot be prepared", async () => {
    mocks.isPackaged = false;
    mocks.setPath.mockImplementation(() => {
      throw new Error("userData unavailable");
    });

    await expect(import("@main/index")).rejects.toThrow("userData unavailable");

    expect(mocks.mkdirSync).toHaveBeenCalledOnce();
    expect(mocks.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.appOn).not.toHaveBeenCalled();
    expect(mocks.startApp).not.toHaveBeenCalled();
  });

  it("quits without loading bootstrap when the single-instance lock is unavailable", async () => {
    mocks.requestSingleInstanceLock.mockReturnValue(false);

    await import("@main/index");

    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.appOn).not.toHaveBeenCalled();
    expect(mocks.startApp).not.toHaveBeenCalled();
  });

  it("registers the second-instance listener before starting bootstrap", async () => {
    const callOrder: string[] = [];
    mocks.requestSingleInstanceLock.mockImplementation(() => {
      callOrder.push("single-instance-lock");
      return true;
    });
    mocks.appOn.mockImplementation(() => {
      callOrder.push("second-instance-listener");
    });
    mocks.startApp.mockImplementation(() => {
      callOrder.push("start-bootstrap");
      return { requestWindowAttention: mocks.requestWindowAttention };
    });

    await import("@main/index");
    await vi.waitFor(() => expect(mocks.startApp).toHaveBeenCalledOnce());

    expect(callOrder).toEqual([
      "single-instance-lock",
      "second-instance-listener",
      "start-bootstrap",
    ]);
  });

  it("coalesces events received before the bootstrap controller is bound", async () => {
    const event = { preventDefault: vi.fn() };
    const argv = ["fyllocode", "--open", "/tmp/project"];
    const workingDirectory = "/tmp";
    const additionalData = { requestedProject: "/tmp/project" };

    mocks.appOn.mockImplementation((name: string, listener: (...args: unknown[]) => void) => {
      if (name === "second-instance") {
        listener(event, argv, workingDirectory, additionalData);
        listener(event, ["fyllocode", "--another"], "/var/tmp", { ignored: true });
      }
    });

    await import("@main/index");
    await vi.waitFor(() => expect(mocks.requestWindowAttention).toHaveBeenCalledOnce());

    expect(mocks.requestWindowAttention).toHaveBeenCalledWith();
  });
});
