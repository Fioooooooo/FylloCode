import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginAuxiliaryProcessShutdown,
  disposeAuxiliaryProcesses,
  forceDisposeAuxiliaryProcesses,
  getActiveAuxiliaryProcessIds,
  resetAuxiliaryProcessRegistryForTests,
  trackAuxiliaryProcess,
} from "@main/infra/process/auxiliary-process-registry";

vi.mock("@main/infra/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function createChild(pid: number) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child;
}

beforeEach(() => {
  resetAuxiliaryProcessRegistryForTests();
  vi.clearAllMocks();
});

describe("auxiliary process registry", () => {
  it("gracefully signals and waits for tracked commands", async () => {
    const child = createChild(30_001);
    trackAuxiliaryProcess(child as never);

    beginAuxiliaryProcessShutdown();
    const disposal = disposeAuxiliaryProcesses();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(getActiveAuxiliaryProcessIds()).toEqual([30_001]);

    child.emit("close", 0, null);
    await disposal;
    expect(getActiveAuxiliaryProcessIds()).toEqual([]);
  });

  it("force-kills the POSIX process group without waiting", () => {
    const child = createChild(30_002);
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    trackAuxiliaryProcess(child as never);

    forceDisposeAuxiliaryProcesses();

    expect(killSpy).toHaveBeenCalledWith(-30_002, "SIGKILL");
    expect(getActiveAuxiliaryProcessIds()).toEqual([]);
    killSpy.mockRestore();
  });
});
