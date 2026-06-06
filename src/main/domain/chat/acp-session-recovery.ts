import type { InitializeResponse } from "@agentclientprotocol/sdk";
import type { TextUIPart } from "ai";
import type { Message } from "@shared/types/chat";
import type { SessionEvent } from "./session-events";
import { wrapAsSystemReminder } from "./system-reminder-wrap";

export type PersistedHistoryLoader = () => Promise<Message[]>;

export interface RecoveryContext {
  hasPersistedHistory: boolean;
  loadPersistedHistory: PersistedHistoryLoader;
}

export interface PromptErrorLike {
  code?: number | string;
  message?: string;
  data?: { details?: string; [key: string]: unknown };
}

export interface SessionRuntimeState {
  observedSessionUpdate: boolean;
  firstObservedEventType: SessionEvent["type"] | null;
  suppressReplay: boolean;
  suppressedReplayEvents: number;
}

export type RecoveryStrategy = "new_session" | "resume_session" | "load_session" | "fresh_fallback";

export interface RecoveryOutcome {
  sessionId: string;
  createdNewSession: boolean;
  recoveryHistoryReminder: TextUIPart | null;
  previousSessionId: string | null;
  strategy: RecoveryStrategy;
}

export function defaultRecoveryContext(): RecoveryContext {
  return {
    hasPersistedHistory: false,
    loadPersistedHistory: async () => [],
  };
}

export function createSessionRuntimeState(): SessionRuntimeState {
  return {
    observedSessionUpdate: false,
    firstObservedEventType: null,
    suppressReplay: false,
    suppressedReplayEvents: 0,
  };
}

export function supportsResume(response: InitializeResponse | undefined): boolean {
  return response?.agentCapabilities?.sessionCapabilities?.resume != null;
}

export function supportsLoad(response: InitializeResponse | undefined): boolean {
  return response?.agentCapabilities?.loadSession === true;
}

export function promptErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as PromptErrorLike;
    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }
  return String(error);
}

export function isSessionMissingError(error: unknown): boolean {
  const candidate = error as PromptErrorLike | undefined;
  const code = candidate?.code;
  if (code === -32002 || code === "RESOURCE_NOT_FOUND" || code === "resource_not_found") {
    return true;
  }

  const texts = [candidate?.message, candidate?.data?.details]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return texts.some(
    (text) =>
      text.includes("session not found") ||
      text.includes("no conversation found with session id") ||
      (code === -32602 && text.includes("session")) ||
      (code === -32603 && text.includes("session"))
  );
}

export function buildHistoryReminder(
  messages: Message[],
  currentPrompt: string
): TextUIPart | null {
  const transcript: string[] = [];

  for (const message of messages) {
    const texts: string[] = [];
    for (const part of message.parts as unknown[]) {
      const text = extractVisibleText(part);
      if (text) {
        texts.push(text);
      }
    }
    const messageText = texts.join("\n");
    if (!messageText) continue;
    transcript.push(`${message.role}: ${messageText}`);
  }

  while (transcript.length > 0 && transcript[transcript.length - 1] === `user: ${currentPrompt}`) {
    transcript.pop();
  }

  if (transcript.length === 0) {
    return null;
  }

  return {
    type: "text",
    text: wrapAsSystemReminder(
      ["请根据以下对话历史，继续与用户进行对话", ...transcript].join("\n")
    ),
  };
}

export function shouldSuppressDuringReplay(event: SessionEvent): boolean {
  switch (event.type) {
    case "available_commands_update":
    case "session_info_update":
    case "config_options_update":
    case "plan_update":
      return false;
    case "text_delta":
    case "reasoning_delta":
    case "tool_call_start":
    case "tool_call_update":
    case "usage_update":
    case "done":
    case "error":
    case "session_id_resolved":
      return true;
  }
}

function extractVisibleText(part: unknown): string | null {
  if (typeof part !== "object" || part === null) {
    return null;
  }
  const candidate = part as { type?: unknown; text?: unknown };
  if (candidate.type !== "text" || typeof candidate.text !== "string") {
    return null;
  }
  const text = candidate.text.trim();
  if (!text || isSystemReminderText(text)) {
    return null;
  }
  return text;
}

function isSystemReminderText(text: string): boolean {
  const normalized = text.trim();
  return normalized.startsWith("<system-reminder>") && normalized.endsWith("</system-reminder>");
}
