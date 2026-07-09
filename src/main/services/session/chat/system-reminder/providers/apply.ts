import template from "../templates/apply.txt?raw";
import { resolveGuidelinesSection } from "./guidelines";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";

export async function resolveApplySystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  const rendered = renderSystemReminderTemplate(template, ctx);
  if (rendered === null) {
    return null;
  }

  const guidelinesSection = await resolveGuidelinesSection(ctx);
  if (guidelinesSection === null) {
    return rendered;
  }

  return [rendered, guidelinesSection].join("\n\n");
}
