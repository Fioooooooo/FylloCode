import template from "../templates/apply.txt?raw";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";

export async function resolveApplySystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  return renderSystemReminderTemplate(template, ctx);
}
