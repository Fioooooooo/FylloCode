import template from "../templates/archive.txt?raw";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";

export async function resolveArchiveSystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  return renderSystemReminderTemplate(template, ctx);
}
