import type { Pinia } from "pinia";
import type { Router } from "vue-router";

export interface FylloBootstrapContext {
  pinia: Pinia;
  router: Router;
}

export interface FylloBootstrapTask {
  name: string;
  run: (context: FylloBootstrapContext) => Promise<void> | void;
}

const tasks: FylloBootstrapTask[] = [];

export function onFylloBootstrap(task: FylloBootstrapTask): void {
  tasks.push(task);
}

export async function runBootstrapTasks(context: FylloBootstrapContext): Promise<void> {
  await Promise.allSettled(
    tasks.map(async (task) => {
      try {
        await task.run(context);
      } catch (error) {
        console.error(`[bootstrap] task failed: ${task.name}`, error);
      }
    })
  );
}
