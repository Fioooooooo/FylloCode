import type { TaskItem } from "@shared/types/task";

export function buildSourceDisplay(task: TaskItem): string {
  const meta = task.sourceMeta;

  if (task.source === "yunxiao" && meta.source === "yunxiao" && meta.key) {
    return `云效 ${meta.key}`;
  }

  if (task.source === "github" && meta.source === "github" && meta.repository && meta.number) {
    return `${meta.repository}#${meta.number}`;
  }

  if (task.source === "local") {
    return "本地";
  }

  return task.source === "yunxiao" ? "云效" : "GitHub";
}
