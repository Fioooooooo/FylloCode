import template from "../templates/chat.txt?raw";
import { renderFylloActionPromptContract } from "@shared/fyllo-action/prompt";
import { renderFylloSignalPromptContract } from "@shared/fyllo-signal/prompt";
import { resolveGuidelinesSection } from "./guidelines";
import { resolveKnowledgeSection } from "./knowledge";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";

export async function resolveChatSystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  const rendered = renderSystemReminderTemplate(template, ctx);
  if (rendered === null) {
    return null;
  }

  const guidelinesSection = await resolveGuidelinesSection(ctx);
  const knowledgeSection = await resolveKnowledgeSection(ctx);

  return [
    rendered,
    guidelinesSection,
    knowledgeSection,
    renderFylloActionPromptContract(),
    renderFylloSignalPromptContract(),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}
