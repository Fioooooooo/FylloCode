import logger from "@main/infra/logger";

export interface LifecycleTask {
  name: string;
  run(): Promise<void> | void;
  force?(): Promise<void> | void;
}

export interface LifecyclePhase {
  name: string;
  tasks: readonly LifecycleTask[];
}

export interface LifecycleTaskResult {
  phase: string;
  task: string;
  status: "fulfilled" | "rejected" | "pending";
  durationMs: number;
}

export interface LifecycleRunResult {
  results: LifecycleTaskResult[];
  deadlineReached: boolean;
  pendingTasks: string[];
}

interface RunLifecyclePhasesOptions {
  deadlineMs: number;
  forceReserveMs?: number;
  now?: () => number;
  onPhaseSettled?: (phase: string, status: "fulfilled" | "rejected" | "pending") => void;
}

let shutdownFence = false;

export function beginShutdown(): boolean {
  if (shutdownFence) return false;
  shutdownFence = true;
  return true;
}

export function isShuttingDown(): boolean {
  return shutdownFence;
}

function delay(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), Math.max(0, ms));
    timer.unref?.();
  });
}

function reportPhaseSettled(
  options: RunLifecyclePhasesOptions,
  phase: string,
  status: "fulfilled" | "rejected" | "pending"
): void {
  try {
    options.onPhaseSettled?.(phase, status);
  } catch (error) {
    logger.warn(`[lifecycle] phase observer "${phase}" failed`, error);
  }
}

/**
 * 按声明顺序运行 phase；phase 内任务并行，且 graceful 与 force 共用一个绝对截止时间。
 */
export async function runLifecyclePhases(
  phases: readonly LifecyclePhase[],
  options: RunLifecyclePhasesOptions
): Promise<LifecycleRunResult> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const absoluteDeadline = startedAt + options.deadlineMs;
  const forceReserveMs = Math.min(Math.max(options.forceReserveMs ?? 0, 0), options.deadlineMs);
  const gracefulDeadline = absoluteDeadline - forceReserveMs;
  const results: LifecycleTaskResult[] = [];
  const running = new Map<LifecycleTask, { phase: string; startedAt: number }>();
  const completed = new Set<LifecycleTask>();
  let deadlineReached = false;

  for (const phase of phases) {
    if (now() >= gracefulDeadline) {
      deadlineReached = true;
      break;
    }

    const taskPromises = phase.tasks.map(async (task) => {
      const taskStartedAt = now();
      running.set(task, { phase: phase.name, startedAt: taskStartedAt });
      try {
        await task.run();
        results.push({
          phase: phase.name,
          task: task.name,
          status: "fulfilled",
          durationMs: Math.max(0, now() - taskStartedAt),
        });
      } catch (error) {
        logger.warn(`[lifecycle] task "${phase.name}/${task.name}" failed`, error);
        results.push({
          phase: phase.name,
          task: task.name,
          status: "rejected",
          durationMs: Math.max(0, now() - taskStartedAt),
        });
      } finally {
        running.delete(task);
        completed.add(task);
      }
    });

    const phaseResult = await Promise.race([
      Promise.allSettled(taskPromises).then(() => "settled" as const),
      delay(gracefulDeadline - now()),
    ]);
    if (phaseResult === "timeout") {
      reportPhaseSettled(options, phase.name, "pending");
      deadlineReached = true;
      break;
    }

    const phaseResults = results.filter((entry) => entry.phase === phase.name);
    reportPhaseSettled(
      options,
      phase.name,
      phaseResults.some((entry) => entry.status === "rejected") ? "rejected" : "fulfilled"
    );
  }

  const phaseByTask = new Map(
    phases.flatMap((phase) => phase.tasks.map((task) => [task, phase.name] as const))
  );
  const pendingAtForce = [...phaseByTask.keys()].filter((task) => !completed.has(task));
  for (const task of pendingAtForce) {
    const state = running.get(task);
    results.push({
      phase: state?.phase ?? phaseByTask.get(task) ?? "unknown",
      task: task.name,
      status: "pending",
      durationMs: state ? Math.max(0, now() - state.startedAt) : 0,
    });
  }

  const forcePromises = pendingAtForce
    .filter((task) => task.force)
    .map((task) => Promise.resolve().then(() => task.force?.()));
  if (forcePromises.length > 0 && now() < absoluteDeadline) {
    await Promise.race([Promise.allSettled(forcePromises), delay(absoluteDeadline - now())]);
  }

  const pendingTasks = pendingAtForce.map((task) => task.name);
  return {
    results,
    deadlineReached: deadlineReached || pendingTasks.length > 0,
    pendingTasks,
  };
}

/** Test-only: clear internal state. */
export function resetLifecycleForTests(): void {
  shutdownFence = false;
}
