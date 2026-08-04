import type { Pinia } from "pinia";
import type { Router } from "vue-router";
import { reactive, readonly } from "vue";

export interface FylloBootstrapContext {
  pinia: Pinia;
  router: Router;
}

export interface FylloBootstrapTask {
  name: string;
  phase: FylloBootstrapPhase;
  run: (context: FylloBootstrapContext) => Promise<void> | void;
}

export type FylloBootstrapPhase = "critical" | "background";
export type FylloBootstrapPhaseStatus = "pending" | "running" | "settled";

export interface FylloBootstrapTaskResult {
  name: string;
  phase: FylloBootstrapPhase;
  status: "fulfilled" | "rejected";
  durationMs: number;
}

interface RunBootstrapTasksOptions {
  onCriticalSettled?: (results: readonly FylloBootstrapTaskResult[]) => Promise<void> | void;
}

const tasks: FylloBootstrapTask[] = [];
const phaseState = reactive<Record<FylloBootstrapPhase, FylloBootstrapPhaseStatus>>({
  critical: "pending",
  background: "pending",
});

export const bootstrapPhaseState = readonly(phaseState);

export function onFylloBootstrap(task: FylloBootstrapTask): void {
  tasks.push(task);
}

async function runPhase(
  phase: FylloBootstrapPhase,
  context: FylloBootstrapContext
): Promise<FylloBootstrapTaskResult[]> {
  phaseState[phase] = "running";
  const phaseTasks = tasks.filter((task) => task.phase === phase);
  const results = await Promise.all(
    phaseTasks.map(async (task): Promise<FylloBootstrapTaskResult> => {
      const startedAt = performance.now();
      try {
        await task.run(context);
        return {
          name: task.name,
          phase,
          status: "fulfilled",
          durationMs: performance.now() - startedAt,
        };
      } catch (error) {
        console.error(`[bootstrap] ${phase} task failed: ${task.name}`, error);
        return {
          name: task.name,
          phase,
          status: "rejected",
          durationMs: performance.now() - startedAt,
        };
      }
    })
  );
  phaseState[phase] = "settled";
  return results;
}

export async function runBootstrapTasks(
  context: FylloBootstrapContext,
  options: RunBootstrapTasksOptions = {}
): Promise<FylloBootstrapTaskResult[]> {
  const criticalResults = await runPhase("critical", context);
  await options.onCriticalSettled?.(criticalResults);
  const backgroundResults = await runPhase("background", context);
  return [...criticalResults, ...backgroundResults];
}
