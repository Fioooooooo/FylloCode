import template from "../templates/chat.txt?raw";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";

export async function resolveChatSystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  return renderSystemReminderTemplate(template, ctx);
}
