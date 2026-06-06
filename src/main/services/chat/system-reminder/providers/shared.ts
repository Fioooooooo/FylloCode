import logger from "@main/infra/logger";
import type { SystemReminderContext } from "../types";

const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;
const ALLOWED_VARIABLES = [
  "changeId",
  "stageIndex",
  "runId",
  "projectPath",
  "worktreePath",
  "mainProjectPath",
] as const;
const ALLOWED_VARIABLE_SET = new Set<string>(ALLOWED_VARIABLES);
type AllowedVariable = (typeof ALLOWED_VARIABLES)[number];

function sanitizeValue(
  ctx: SystemReminderContext,
  field: string,
  value: string | number | undefined
): string | null {
  if (value === undefined) return "";

  const text = String(value);
  if (!text.includes("<") && !text.includes(">")) {
    return text;
  }

  logger.warn("[system-reminder] rejected reminder variable", {
    owner: ctx.owner,
    field,
    fylloSessionId: ctx.fylloSessionId,
  });
  return null;
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
    const sanitized = sanitizeValue(ctx, field, getVariableValue(ctx, field) ?? undefined);
    if (sanitized === null) {
      return null;
    }
    sanitizedValues[field] = sanitized;
  }

  return template.replace(VARIABLE_PATTERN, (match, field: string) => {
    if (!ALLOWED_VARIABLE_SET.has(field)) {
      return match;
    }
    return sanitizedValues[field as AllowedVariable];
  });
}
