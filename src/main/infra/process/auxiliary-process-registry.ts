import type { ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import logger from "@main/infra/logger";

const IS_WINDOWS = process.platform === "win32";
const children = new Set<ChildProcess>();
const emptyWaiters = new Set<() => void>();
let shuttingDown = false;

function settleIfEmpty(): void {
  if (children.size > 0) return;
  for (const resolve of emptyWaiters) resolve();
  emptyWaiters.clear();
}

export function trackAuxiliaryProcess(child: ChildProcess): void {
  children.add(child);
  const remove = (): void => {
    children.delete(child);
    settleIfEmpty();
  };
  child.once("close", remove);
  child.once("error", remove);
  if (shuttingDown) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The force hook owns any process that survives graceful signalling.
    }
  }
}

export function beginAuxiliaryProcessShutdown(): void {
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // The force hook owns any process that survives graceful signalling.
    }
  }
}

export async function disposeAuxiliaryProcesses(): Promise<void> {
  beginAuxiliaryProcessShutdown();
  if (children.size === 0) return;
  await new Promise<void>((resolve) => emptyWaiters.add(resolve));
}

function forceKill(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  if (IS_WINDOWS) {
    try {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref();
    } catch (error: unknown) {
      logger.warn(`[auxiliary-process] emergency taskkill failed for pid=${pid}`, error);
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      logger.warn(`[auxiliary-process] emergency SIGKILL failed for pgid=${pid}`, error);
    }
  }
}

export function forceDisposeAuxiliaryProcesses(): void {
  beginAuxiliaryProcessShutdown();
  for (const child of children) forceKill(child);
  children.clear();
  settleIfEmpty();
}

export function getActiveAuxiliaryProcessIds(): number[] {
  return [...children].map((child) => child.pid).filter((pid): pid is number => pid !== undefined);
}

export function resetAuxiliaryProcessRegistryForTests(): void {
  children.clear();
  settleIfEmpty();
  shuttingDown = false;
}
