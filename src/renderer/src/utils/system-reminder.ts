export function isSystemReminderPart(part: unknown): boolean {
  if (typeof part !== "object" || part === null) {
    return false;
  }

  const candidate = part as { type?: unknown; text?: unknown };
  if (candidate.type !== "text" || typeof candidate.text !== "string") {
    return false;
  }

  const text = candidate.text.trim();
  return text.startsWith("<system-reminder>") && text.endsWith("</system-reminder>");
}
