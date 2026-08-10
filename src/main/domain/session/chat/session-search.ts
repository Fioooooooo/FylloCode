import type { Message } from "@shared/types/chat";

const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
export const SESSION_SEARCH_SNIPPET_LENGTH = 160;

export function stripSystemReminderSections(text: string): string {
  return text.replace(SYSTEM_REMINDER_PATTERN, " ");
}

export function normalizeSessionSearchText(text: string): string {
  return stripSystemReminderSections(text).replace(/\s+/g, " ").trim();
}

export function normalizeSessionSearchQuery(query: string): string {
  return normalizeSessionSearchText(query).toLocaleLowerCase();
}

export function matchesSessionSearchQuery(text: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return false;
  }
  return normalizeSessionSearchText(text).toLocaleLowerCase().includes(normalizedQuery);
}

function buildSnippet(text: string, matchIndex: number): string {
  if (text.length <= SESSION_SEARCH_SNIPPET_LENGTH) {
    return text;
  }

  const edgeContentLength = SESSION_SEARCH_SNIPPET_LENGTH - 1;
  if (matchIndex < edgeContentLength / 2) {
    return `${text.slice(0, edgeContentLength)}…`;
  }

  if (matchIndex > text.length - edgeContentLength / 2) {
    return `…${text.slice(-edgeContentLength)}`;
  }

  const middleContentLength = SESSION_SEARCH_SNIPPET_LENGTH - 2;
  const start = Math.max(1, Math.floor(matchIndex - middleContentLength / 2));
  return `…${text.slice(start, start + middleContentLength)}…`;
}

export function findFirstMessageSearchSnippet(
  messages: readonly Message[],
  query: string
): string | null {
  const normalizedQuery = normalizeSessionSearchQuery(query);
  if (!normalizedQuery) {
    return null;
  }

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type !== "text") {
        continue;
      }

      const text = normalizeSessionSearchText(part.text);
      const matchIndex = text.toLocaleLowerCase().indexOf(normalizedQuery);
      if (matchIndex >= 0) {
        return buildSnippet(text, matchIndex);
      }
    }
  }

  return null;
}
