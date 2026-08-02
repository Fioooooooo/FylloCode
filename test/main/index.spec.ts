import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestSingleInstanceLock: vi.fn(),
  quit: vi.fn(),
  appOn: vi.fn(),
  startApp: vi.fn(),
  requestWindowAttention: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
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
    vi.clearAllMocks();
    vi.resetModules();
    mocks.requestSingleInstanceLock.mockReturnValue(true);
    mocks.startApp.mockReturnValue({
      requestWindowAttention: mocks.requestWindowAttention,
    });
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
