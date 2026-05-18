import type { TaskDescription, TaskItem } from "@shared/types/task";

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

function stripHtmlTags(content: string): string {
  return content
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "");
}

function normalizePlainText(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function getTaskDescriptionPlainText(description: TaskDescription): string {
  const content =
    description.format === "html"
      ? stripHtmlTags(description.content)
      : description.format === "markdown"
        ? stripMarkdown(description.content)
        : description.content;

  return normalizePlainText(content).replace(/\n{3,}/g, "\n\n");
}

export function getTaskDescriptionSummary(task: TaskItem): string {
  return getTaskDescriptionPlainText(task.description);
}
