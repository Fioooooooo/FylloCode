import type { DynamicToolUIPart, UIMessage } from "ai";
import { getAgentById } from "@main/infra/acp/agent-catalog";
import {
  listSpawnedSessionsForParent,
  type SpawnedSessionMeta,
  type SpawnedSessionStoredView,
  type SpawnedTurnPhase,
  type SpawnedTurnRecord,
} from "@main/infra/storage/spawned-session-store";
import type { MessageMeta } from "@shared/types/chat";
import type {
  SpawnedSessionDetailResult,
  SpawnedSessionDisplayStatus,
  SpawnedSessionMessage,
  SpawnedSessionSummary,
  SpawnedSessionTurnSummary,
} from "@shared/ipc/session/spawned-session.schemas";
import { spawnNotificationService } from "./spawn-notification-service";
import {
  spawnedSessionManager,
  type SpawnedSessionInspectionSnapshot,
} from "./spawned-session-manager";

export interface SpawnedSessionQueryOwner {
  workspaceId: string;
  parentSessionId: string;
}

const ACTIVE_STATUSES = new Set<SpawnedSessionDisplayStatus>(["starting", "running"]);

function displayStatus(phase: SpawnedTurnPhase): SpawnedSessionDisplayStatus {
  if (phase === "completed") return "idle";
  if (phase === "cancelling") return "running";
  return phase;
}

function iso(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function textFromMessage(message: UIMessage<MessageMeta>): string {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

function projectToolPart(
  part: DynamicToolUIPart
): Extract<SpawnedSessionMessage, { role: "assistant" }>["parts"][number] {
  const state =
    part.state === "output-denied"
      ? "output-error"
      : part.state === "approval-requested" || part.state === "approval-responded"
        ? "input-available"
        : part.state;
  return {
    type: "dynamic-tool",
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    ...(part.title ? { title: part.title } : {}),
    state,
    ...(part.input !== undefined ? { input: structuredClone(part.input) } : {}),
    ...(part.output !== undefined ? { output: structuredClone(part.output) } : {}),
    ...(part.errorText ? { errorText: part.errorText } : {}),
    ...(part.toolMetadata ? { toolMetadata: structuredClone(part.toolMetadata) } : {}),
  };
}

function projectMessage(
  message: UIMessage<MessageMeta>,
  durable: boolean,
  fallbackDate: string
): SpawnedSessionMessage | null {
  const createdAt = iso(message.metadata?.createdAt, fallbackDate);
  if (message.role === "user") {
    const parts = message.parts
      .filter(
        (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          part.type === "text"
      )
      .map((part) => ({ type: "text" as const, text: part.text }));
    return { id: message.id, role: "user", createdAt, durable: true, parts };
  }
  if (message.role !== "assistant") return null;
  const parts: Extract<SpawnedSessionMessage, { role: "assistant" }>["parts"] = [];
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      parts.push({ type: part.type, text: part.text });
    } else if (part.type === "dynamic-tool") {
      parts.push(projectToolPart(part));
    }
  }
  return { id: message.id, role: "assistant", createdAt, durable, parts };
}

function latestTurn(view: SpawnedSessionStoredView): SpawnedTurnRecord | undefined {
  return view.turns.at(-1);
}

function summaryStatus(
  meta: SpawnedSessionMeta,
  turn: SpawnedTurnRecord | undefined,
  live: SpawnedSessionInspectionSnapshot | null
): SpawnedSessionDisplayStatus {
  if (turn) return displayStatus(turn.phase);
  if (live) return "running";
  if (meta.status === "running") return "interrupted";
  return meta.status;
}

export class SpawnedSessionQueryService {
  private readonly reconciliation = new Map<string, Promise<void>>();

  private ensureReconciled(workspaceId: string): Promise<void> {
    const existing = this.reconciliation.get(workspaceId);
    if (existing) return existing;
    const pending = spawnNotificationService
      .reconcileWorkspace(workspaceId, (record) => spawnedSessionManager.isTurnLive(record))
      .catch((error: unknown) => {
        this.reconciliation.delete(workspaceId);
        throw error;
      });
    this.reconciliation.set(workspaceId, pending);
    return pending;
  }

  private async buildSummary(view: SpawnedSessionStoredView): Promise<SpawnedSessionSummary> {
    const turn = latestTurn(view);
    const live = spawnedSessionManager.getInspectionSnapshot({
      workspaceId: view.meta.workspaceId,
      parentSessionId: view.meta.parentSessionId,
      sessionId: view.meta.sessionId,
    });
    const matchingLive = live && (!turn || live.turnId === turn.turnId) ? live : null;
    const status = summaryStatus(view.meta, turn, matchingLive);
    const agent = await getAgentById(view.meta.agentId);
    const userMessages = view.messages.filter((message) => message.role === "user");
    const currentPrompt = userMessages.at(-1) ? textFromMessage(userMessages.at(-1)!) : undefined;
    const error = turn?.error ?? view.meta.error;
    return {
      sessionId: view.meta.sessionId,
      agent: { agentId: view.meta.agentId, name: agent?.name ?? view.meta.agentId },
      status,
      ...((turn?.mode ?? matchingLive?.mode) ? { mode: turn?.mode ?? matchingLive?.mode } : {}),
      ...((turn?.turnId ?? matchingLive?.turnId)
        ? { currentTurnId: turn?.turnId ?? matchingLive?.turnId }
        : {}),
      ...((turn?.startedAt ?? matchingLive?.startedAt)
        ? { startedAt: turn?.startedAt ?? matchingLive?.startedAt }
        : {}),
      ...((turn?.lastActivityAt ?? matchingLive?.lastActivityAt)
        ? { lastActivityAt: matchingLive?.lastActivityAt ?? turn?.lastActivityAt }
        : {}),
      updatedAt: turn?.updatedAt ?? view.meta.updatedAt,
      ...(currentPrompt ? { promptPreview: currentPrompt.slice(0, 240) } : {}),
      ...((turn?.responseId ?? view.meta.latestResponseId)
        ? { latestResponseId: turn?.responseId ?? view.meta.latestResponseId }
        : {}),
      ...(error ? { error } : {}),
    };
  }

  async listSpawnedSessions(owner: SpawnedSessionQueryOwner): Promise<SpawnedSessionSummary[]> {
    await this.ensureReconciled(owner.workspaceId);
    const views = await listSpawnedSessionsForParent(owner);
    const summaries = await Promise.all(views.map((view) => this.buildSummary(view)));
    return summaries.sort((left, right) => {
      const active =
        Number(ACTIVE_STATUSES.has(right.status)) - Number(ACTIVE_STATUSES.has(left.status));
      return active || right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async getSpawnedSessionDetail(
    owner: SpawnedSessionQueryOwner & { sessionId: string }
  ): Promise<SpawnedSessionDetailResult> {
    await this.ensureReconciled(owner.workspaceId);
    const view = (await listSpawnedSessionsForParent(owner)).find(
      (candidate) => candidate.meta.sessionId === owner.sessionId
    );
    if (!view) return { status: "not_found" };

    const summary = await this.buildSummary(view);
    const live = spawnedSessionManager.getInspectionSnapshot(owner);
    const latest = latestTurn(view);
    const matchingLive = live && (!latest || live.turnId === latest.turnId) ? live : null;
    const messages = view.messages
      .map((message) => projectMessage(message, true, view.meta.updatedAt))
      .filter((message): message is SpawnedSessionMessage => message !== null);
    if (
      matchingLive?.liveAssistantMessage &&
      latest &&
      !["completed", "error", "expired", "interrupted"].includes(latest.phase)
    ) {
      const projected = projectMessage(
        matchingLive.liveAssistantMessage,
        false,
        matchingLive.lastActivityAt
      );
      if (projected) messages.push(projected);
    }
    const prompts = messages.filter(
      (message): message is Extract<SpawnedSessionMessage, { role: "user" }> =>
        message.role === "user"
    );
    const promptText = (message: Extract<SpawnedSessionMessage, { role: "user" }>): string =>
      message.parts.map((part) => part.text).join("\n");
    const turns: SpawnedSessionTurnSummary[] = view.turns.map((turn, index) => ({
      turnId: turn.turnId,
      ordinal: index + 1,
      mode: turn.mode,
      status: displayStatus(turn.phase),
      startedAt: turn.startedAt,
      lastActivityAt:
        matchingLive?.turnId === turn.turnId ? matchingLive.lastActivityAt : turn.lastActivityAt,
      updatedAt: turn.updatedAt,
      ...(turn.responseId ? { responseId: turn.responseId } : {}),
      ...(turn.error ? { error: turn.error } : {}),
      recentActivity:
        matchingLive?.turnId === turn.turnId
          ? matchingLive.recentActivity
          : structuredClone(turn.recentActivity),
    }));
    return {
      status: "ready",
      summary,
      ...(prompts[0] ? { initialPrompt: { text: promptText(prompts[0]) } } : {}),
      ...(prompts.at(-1) ? { currentPrompt: { text: promptText(prompts.at(-1)!) } } : {}),
      turns,
      messages,
    };
  }
}

export const spawnedSessionQueryService = new SpawnedSessionQueryService();
