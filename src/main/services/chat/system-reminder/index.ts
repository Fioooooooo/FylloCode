import type { TextUIPart } from "ai";
import { wrapAsSystemReminder } from "@main/domain/chat/system-reminder-wrap";
import { resolveChatSystemReminder } from "./providers/chat";
import { resolveApplySystemReminder } from "./providers/apply";
import { resolveArchiveSystemReminder } from "./providers/archive";
import type { SystemReminderContext } from "./types";

const providers = {
  chat: resolveChatSystemReminder,
  apply: resolveApplySystemReminder,
  archive: resolveArchiveSystemReminder,
} as const;

export async function resolveSystemReminder(
  ctx: SystemReminderContext
): Promise<TextUIPart | null> {
  const provider = providers[ctx.owner];
  if (!provider) {
    return null;
  }

  const body = await provider(ctx);
  if (body === null) {
    return null;
  }

  return {
    type: "text",
    text: wrapAsSystemReminder(body),
  };
}
