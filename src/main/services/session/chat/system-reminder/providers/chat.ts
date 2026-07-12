import template from "../templates/chat.txt?raw";
import { formatFylloActionContractForPrompt } from "@shared/constants/fyllo-action-contracts";
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

  return [rendered, guidelinesSection, knowledgeSection, formatFylloActionContractForPrompt()]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}
