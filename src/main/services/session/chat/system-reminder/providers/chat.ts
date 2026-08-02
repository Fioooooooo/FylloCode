import template from "../templates/chat.txt?raw";
import { renderFylloActionPromptContract } from "@shared/fyllo-action/prompt";
import { renderFylloSignalPromptContract } from "@shared/fyllo-signal/prompt";
import { resolveGuidelinesSection } from "./guidelines";
import { resolveKnowledgeSection } from "./knowledge";
import { renderSystemReminderTemplate } from "./shared";
import type { SystemReminderContext } from "../types";
import { renderWorkspaceSection } from "./workspace";
import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";

export async function resolveChatSystemReminder(
  ctx: SystemReminderContext
): Promise<string | null> {
  const rendered = renderSystemReminderTemplate(template, ctx);
  if (rendered === null) {
    return null;
  }
  if (!ctx.workspaceSnapshot) {
    throw ipcError(
      IpcErrorCodes.VALIDATION_ERROR,
      "Chat system reminder requires a validated Session Workspace snapshot"
    );
  }

  const guidelinesSection = await resolveGuidelinesSection(ctx);
  const knowledgeSection = await resolveKnowledgeSection(ctx);
  const workspaceSection = renderWorkspaceSection(ctx.workspaceSnapshot);

  return [
    rendered,
    workspaceSection,
    guidelinesSection,
    knowledgeSection,
    renderFylloActionPromptContract(),
    renderFylloSignalPromptContract(),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}
