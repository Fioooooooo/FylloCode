import logger from "@main/infra/logger";
import type { SystemReminderContext } from "../types";

const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;
const CONDITIONAL_PATTERN = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const ALLOWED_VARIABLES = [
  "changeId",
  "stageIndex",
  "runId",
  "projectPath",
  "worktreePath",
  "mainProjectPath",
  "taskRef",
  "taskTitle",
] as const;
const ALLOWED_VARIABLE_SET = new Set<string>(ALLOWED_VARIABLES);
type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

export function escapeAngleBrackets(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function sanitizeValue(
  ctx: SystemReminderContext,
  field: string,
  value: string | number | undefined
): string {
  if (value === undefined) return "";

  const text = String(value);
  if (!text.includes("<") && !text.includes(">")) {
    return text;
  }

  logger.warn("[system-reminder] encoding angle brackets in reminder variable", {
    owner: ctx.owner,
    field,
    fylloSessionId: ctx.fylloSessionId,
  });
  return escapeAngleBrackets(text);
}

function getVariableValue(
  ctx: SystemReminderContext,
  field: AllowedVariable
): string | number | undefined | null {
  switch (field) {
    case "changeId":
      return ctx.changeId;
    case "stageIndex":
      return ctx.stageIndex;
    case "runId":
      return ctx.runId;
    case "projectPath":
      return ctx.projectPath;
    case "worktreePath":
      return ctx.worktreePath;
    case "mainProjectPath":
      return ctx.projectPath;
    case "taskRef":
      return ctx.taskRef;
    case "taskTitle":
      return ctx.taskTitle;
    default:
      return undefined;
  }
}

export function renderSystemReminderTemplate(
  template: string,
  ctx: SystemReminderContext
): string | null {
  const sanitizedValues = {} as Record<AllowedVariable, string>;

  for (const field of ALLOWED_VARIABLES) {
    sanitizedValues[field] = sanitizeValue(ctx, field, getVariableValue(ctx, field) ?? undefined);
  }

  const renderedConditionals = template.replace(
    CONDITIONAL_PATTERN,
    (match, field: string, content: string) => {
      if (!ALLOWED_VARIABLE_SET.has(field)) {
        return match;
      }
      return sanitizedValues[field as AllowedVariable] ? content : "";
    }
  );

  return renderedConditionals.replace(VARIABLE_PATTERN, (match, field: string) => {
    if (!ALLOWED_VARIABLE_SET.has(field)) {
      return match;
    }
    return sanitizedValues[field as AllowedVariable];
  });
}
