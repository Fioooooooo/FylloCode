import type { DynamicToolUIPart, UIMessage } from "ai";
import { getAgentById } from "@main/infra/acp/agent-catalog";
import {
  listSpawnedSessionSummariesForParent,
  loadSpawnedSessionStoredView,
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
  SpawnedSessionTurnDetail,
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
const TERMINAL_TURN_PHASES = new Set<SpawnedTurnPhase>([
  "completed",
  "error",
  "expired",
  "interrupted",
]);

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

function turnIndexForTimestamp(timestamp: string, turns: SpawnedTurnRecord[]): number | undefined {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return undefined;
  for (let index = 0; index < turns.length; index += 1) {
    const start = Date.parse(turns[index]!.startedAt);
    const nextStart = turns[index + 1] ? Date.parse(turns[index + 1]!.startedAt) : Number.NaN;
    if (Number.isNaN(start) || (index < turns.length - 1 && Number.isNaN(nextStart))) continue;
    if (time >= start && (index === turns.length - 1 || time < nextStart)) return index;
  }
  return undefined;
}

interface TurnBucket {
  turn: SpawnedTurnRecord;
  prompt?: { text: string };
  messages: Extract<SpawnedSessionMessage, { role: "assistant" }>[];
}

function projectTurnDetails(
  view: SpawnedSessionStoredView,
  matchingLive: SpawnedSessionInspectionSnapshot | null
): SpawnedSessionTurnDetail[] {
  const buckets: TurnBucket[] = view.turns.map((turn) => ({ turn, messages: [] }));
  let currentTurnIndex = -1;

  for (const rawMessage of view.messages) {
    const message = projectMessage(rawMessage, true, view.meta.updatedAt);
    if (!message) continue;
    const windowIndex = turnIndexForTimestamp(message.createdAt, view.turns);
    if (message.role === "user") {
      const fallbackIndex =
        currentTurnIndex + 1 < buckets.length
          ? currentTurnIndex + 1
          : currentTurnIndex >= 0
            ? currentTurnIndex
            : undefined;
      const targetIndex = windowIndex ?? fallbackIndex;
      if (targetIndex === undefined) continue;
      currentTurnIndex = targetIndex;
      buckets[targetIndex]!.prompt = {
        text: message.parts.map((part) => part.text).join("\n"),
      };
      continue;
    }

    const targetIndex = windowIndex ?? (currentTurnIndex >= 0 ? currentTurnIndex : undefined);
    if (targetIndex !== undefined && buckets[targetIndex]) {
      buckets[targetIndex]!.messages.push(message);
    }
  }

  const latest = view.turns.at(-1);
  if (
    matchingLive?.liveAssistantMessage &&
    latest &&
    !TERMINAL_TURN_PHASES.has(latest.phase) &&
    matchingLive.turnId === latest.turnId
  ) {
    const liveMessage = projectMessage(
      matchingLive.liveAssistantMessage,
      false,
      matchingLive.lastActivityAt
    );
    const latestBucket = buckets.at(-1);
    if (liveMessage?.role === "assistant" && latestBucket) latestBucket.messages.push(liveMessage);
  }

  return buckets.map(({ turn, prompt, messages }, index) => ({
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
    ...(prompt ? { prompt } : {}),
    messages,
  }));
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

  private async buildSummary(
    meta: SpawnedSessionMeta,
    turn: SpawnedTurnRecord | undefined,
    promptPreview = meta.currentPromptPreview
  ): Promise<SpawnedSessionSummary> {
    const live = spawnedSessionManager.getInspectionSnapshot({
      workspaceId: meta.workspaceId,
      parentSessionId: meta.parentSessionId,
      sessionId: meta.sessionId,
    });
    const matchingLive = live && (!turn || live.turnId === turn.turnId) ? live : null;
    const status = summaryStatus(meta, turn, matchingLive);
    const agent = await getAgentById(meta.agentId);
    return {
      sessionId: meta.sessionId,
      agent: { agentId: meta.agentId, name: agent?.name ?? meta.agentId },
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
      updatedAt: turn?.updatedAt ?? meta.updatedAt,
      ...(promptPreview !== undefined ? { promptPreview } : {}),
      ...((turn?.responseId ?? meta.latestResponseId)
        ? { latestResponseId: turn?.responseId ?? meta.latestResponseId }
        : {}),
      ...((turn?.error ?? meta.error) ? { error: turn?.error ?? meta.error } : {}),
    };
  }

  async listSpawnedSessions(owner: SpawnedSessionQueryOwner): Promise<SpawnedSessionSummary[]> {
    await this.ensureReconciled(owner.workspaceId);
    const summaries = await listSpawnedSessionSummariesForParent(owner);
    const projected = await Promise.all(
      summaries.map(({ meta, latestTurn: turn }) => this.buildSummary(meta, turn ?? undefined))
    );
    return projected.sort((left, right) => {
      const active =
        Number(ACTIVE_STATUSES.has(right.status)) - Number(ACTIVE_STATUSES.has(left.status));
      return active || right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async getSpawnedSessionDetail(
    owner: SpawnedSessionQueryOwner & { sessionId: string }
  ): Promise<SpawnedSessionDetailResult> {
    await this.ensureReconciled(owner.workspaceId);
    const view = await loadSpawnedSessionStoredView(owner);
    if (!view) return { status: "not_found" };

    const live = spawnedSessionManager.getInspectionSnapshot(owner);
    const latest = latestTurn(view);
    const matchingLive = live && (!latest || live.turnId === latest.turnId) ? live : null;
    const turns = projectTurnDetails(view, matchingLive);
    const summary = await this.buildSummary(
      view.meta,
      latest,
      view.meta.currentPromptPreview ?? turns.at(-1)?.prompt?.text
    );
    return { status: "ready", summary, turns };
  }
}

export const spawnedSessionQueryService = new SpawnedSessionQueryService();
