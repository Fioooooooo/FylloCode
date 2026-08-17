import { randomUUID } from "node:crypto";
import { generateId, type UIMessage } from "ai";
import type { AcpSessionStore } from "@main/domain/session/chat/acp-session-store";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import { getAgentById, listAgents } from "@main/infra/acp/agent-catalog";
import { readInstalledRecords } from "@main/infra/acp/detector";
import {
  getOrStartProcess,
  getReadyProcess,
  hasActiveAcpSession,
  onAgentProcessInvalidated,
} from "@main/infra/process/acp-process-pool";
import { loadSessionMeta } from "@main/infra/storage/session-store";
import {
  appendSpawnedSessionMessage,
  beginSpawnedSessionStoreShutdown,
  createSpawnedTurnRecord,
  deleteSpawnedSessionParent,
  fenceSpawnedSessionParent,
  inlineSpawnedResponse,
  loadLatestSpawnedTurnRecord,
  loadSpawnedSessionMeta,
  patchSpawnedTurnRecord,
  patchSpawnedSessionMeta,
  patchSpawnedSessionMessageMetadata,
  readSpawnedSessionResponseChunk,
  spawnedMessageToResponseMarkdown,
  writeSpawnedSessionMeta,
  writeSpawnedSessionResponse,
  type SpawnedSessionMeta,
  type SpawnedTurnRecord,
} from "@main/infra/storage/spawned-session-store";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { MessageMeta, TokenUsage } from "@shared/types/chat";
import {
  type AvailableAgentsResult,
  type CheckSessionStatusResult,
  type PromptToAgentParams,
  type PromptToAgentAcceptedResult,
  type PromptToAgentResult,
  type ReadResponseParams,
  type ReadResponseResult,
  type SpawnCaller,
  type SpawnConfigOptionSummary,
  type SpawnRpcErrorCode,
  type SpawnWarning,
  type SpawnTurnMode,
} from "@shared/types/fyllo-spawn-rpc";
import { AcpSession, type AcpSessionOpts } from "@main/services/session/chat/acp-session";
import { driveAcpTurn, type AcpTurnRunner } from "@main/services/session/chat/acp-stream-driver";
import { assertAgentWorkspaceCompatibility } from "@main/services/session/chat/agent-workspace-compatibility";
import { ensureSessionWorkspaceSnapshot } from "@main/services/session/chat/chat-service";
import {
  sessionRegistry,
  spawnSessionRegistryKey,
} from "@main/services/session/chat/session-registry";
import { spawnNotificationService } from "@main/services/session/spawn/spawn-notification-service";
import {
  SPAWN_ACTIVE_PROCESS_INVALIDATED_MESSAGE,
  SPAWN_APP_RESTARTED_MESSAGE,
  SPAWN_APP_SHUTDOWN_MESSAGE,
  SPAWN_COMPLETED_PROCESS_INVALIDATED_MESSAGE,
  SPAWN_PROCESS_INVALIDATED_FALLBACK_MESSAGE,
} from "@main/services/session/spawn/spawn-status-messages";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

export const MAX_ACTIVE_SPAWN_TURNS_PER_PARENT = 4;
export const MAX_ACTIVE_SPAWN_TURNS_GLOBAL = 8;
export const MAX_RESIDENT_IDLE_SPAWNED_SESSIONS_PER_PARENT = 32;
export const SPAWN_TURN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1_000;
export const SPAWN_TURN_CANCEL_GRACE_MS = 5_000;

type Timer = ReturnType<typeof setTimeout>;

export interface SpawnManagerRuntime {
  now(): Date;
  setTimeout(callback: () => void, ms: number): Timer;
  clearTimeout(timer: Timer): void;
}

const defaultRuntime: SpawnManagerRuntime = {
  now: () => new Date(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

class SpawnServiceError extends Error {
  constructor(
    public readonly code: SpawnRpcErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "SpawnServiceError";
  }
}

interface SpawnOwner extends SpawnCaller {
  sessionId: string;
}

interface ActiveTurn {
  owner: SpawnOwner;
  turnId: string;
  mode: SpawnTurnMode;
  agentId?: string;
  startedAt: string;
  lastActivityAt: string;
  recentActivity: Array<{ kind: string; at: string; message?: string }>;
  runner?: AcpTurnRunner;
  inactivityTimer?: Timer;
  timeoutResolve: () => void;
  timeoutPromise: Promise<void>;
  settledResolve: () => void;
  settledPromise: Promise<void>;
  timedOut: boolean;
  forceError?: { code: string; message: string };
  acceptedSettled: boolean;
  acceptedSucceeded: boolean;
  acceptedResolve: (result: PromptToAgentResult) => void;
  acceptedReject: (error: unknown) => void;
  acceptedPromise: Promise<PromptToAgentResult>;
  notificationId?: string;
  liveAssistantMessage?: UIMessage<MessageMeta>;
}

export interface SpawnedSessionInspectionSnapshot {
  turnId: string;
  mode: SpawnTurnMode;
  startedAt: string;
  lastActivityAt: string;
  recentActivity: Array<{ kind: string; at: string; message?: string }>;
  liveAssistantMessage?: UIMessage<MessageMeta>;
}

export interface SpawnedSessionViewWake {
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
}

type ViewWakeHandler = (payload: SpawnedSessionViewWake) => void;

interface SpawnTurnHandle {
  accepted: Promise<PromptToAgentResult>;
  completion: Promise<PromptToAgentResult>;
  cancel: () => void;
}

interface LiveEntry {
  meta: SpawnedSessionMeta;
  lastAccessedAt: number;
}

function ownerKey(owner: SpawnOwner): string {
  return `${owner.workspaceId}\0${owner.parentSessionId}\0${owner.sessionId}`;
}

function parentKey(caller: SpawnCaller): string {
  return `${caller.workspaceId}\0${caller.parentSessionId}`;
}

function storeOwner(owner: SpawnOwner) {
  return {
    workspaceId: owner.workspaceId,
    parentSessionId: owner.parentSessionId,
    sessionId: owner.sessionId,
  };
}

function expiredStatus(message: string): CheckSessionStatusResult {
  return {
    status: "expired",
    code: "AGENT_PROCESS_INVALIDATED",
    message,
  };
}

function isInterruptedCode(code: string): code is "APP_RESTARTED" | "APP_SHUTDOWN" {
  return code === "APP_RESTARTED" || code === "APP_SHUTDOWN";
}

function summarizeConfig(options: AcpSessionConfigOption[]): SpawnConfigOptionSummary[] {
  return options.map((option) => ({
    id: option.id,
    name: option.name,
    type: option.type,
    currentValue: option.currentValue,
  }));
}

function userMessage(sessionId: string, prompt: string, createdAt: Date): UIMessage<MessageMeta> {
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: prompt }],
    metadata: { sessionId, createdAt, updatedAt: createdAt },
  };
}

class SpawnedAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly owner: SpawnOwner,
    private readonly nowIso: () => string
  ) {}

  async loadRecoveryState() {
    const meta = await loadSpawnedSessionMeta(storeOwner(this.owner));
    return {
      acpSessionId: meta?.acpSessionId ?? null,
      configOptions: structuredClone(meta?.configOptions ?? []),
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await patchSpawnedSessionMeta(storeOwner(this.owner), {
      acpSessionId,
      updatedAt: this.nowIso(),
    });
  }
}

export class SpawnedSessionManager {
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private readonly activeByParent = new Map<string, number>();
  private readonly liveEntries = new Map<string, LiveEntry>();
  private readonly restartReconciliations = new Map<string, Promise<void>>();
  private readonly deletingParents = new Set<string>();
  private shuttingDown = false;
  private disposeProcessInvalidation: (() => void) | null = null;
  private viewWakeHandler: ViewWakeHandler | null = null;
  private readonly viewWakeTimers = new Map<string, Timer>();

  constructor(private readonly runtime: SpawnManagerRuntime = defaultRuntime) {}

  start(): void {
    if (this.disposeProcessInvalidation || this.shuttingDown) return;
    this.disposeProcessInvalidation = onAgentProcessInvalidated(({ agentId }) => {
      this.invalidateAgent(agentId);
    });
  }

  setViewWakeHandler(handler: ViewWakeHandler | null): void {
    this.viewWakeHandler = handler;
  }

  getInspectionSnapshot(owner: SpawnOwner): SpawnedSessionInspectionSnapshot | null {
    const active = this.activeTurns.get(ownerKey(owner));
    if (!active) return null;
    return structuredClone({
      turnId: active.turnId,
      mode: active.mode,
      startedAt: active.startedAt,
      lastActivityAt: active.lastActivityAt,
      recentActivity: active.recentActivity,
      ...(active.liveAssistantMessage ? { liveAssistantMessage: active.liveAssistantMessage } : {}),
    });
  }

  async availableAgents(caller: SpawnCaller): Promise<AvailableAgentsResult> {
    await this.requireParentSnapshot(caller);
    const [agents, installed] = await Promise.all([listAgents(), readInstalledRecords()]);
    return {
      agents: agents
        .filter((agent) => agent.source === "custom" || installed[agent.id] !== undefined)
        .map((agent) => ({
          agentId: agent.id,
          name: agent.name,
          description: agent.registryEntry?.description ?? "Custom ACP Agent",
        })),
    };
  }

  async promptToAgent(
    caller: SpawnCaller,
    params: PromptToAgentParams,
    signal?: AbortSignal
  ): Promise<PromptToAgentResult> {
    if (this.shuttingDown) {
      throw new SpawnServiceError("SPAWN_RPC_UNAVAILABLE", "Spawn runtime is shutting down", true);
    }
    const owner: SpawnOwner = {
      ...caller,
      sessionId: params.sessionId ?? randomUUID(),
    };
    const mode: SpawnTurnMode = params.background === true ? "background" : "sync";
    const reservation = this.reserve(owner, mode);
    if (reservation) return reservation;
    const active = this.activeTurns.get(ownerKey(owner))!;
    const handle = this.createTurnHandle(caller, owner, params, active, signal);
    if (mode === "background") {
      void handle.completion.catch(() => undefined);
      return handle.accepted;
    }
    return handle.completion;
  }

  private createTurnHandle(
    caller: SpawnCaller,
    owner: SpawnOwner,
    params: PromptToAgentParams,
    active: ActiveTurn,
    signal?: AbortSignal
  ): SpawnTurnHandle {
    const completion = this.executeTurn(caller, owner, params, active, signal)
      .then((result) => {
        if (!active.acceptedSettled) {
          active.acceptedSettled = true;
          active.acceptedResolve(result);
        }
        return result;
      })
      .catch((error: unknown) => {
        if (!active.acceptedSettled) {
          active.acceptedSettled = true;
          active.acceptedReject(error);
        }
        throw error;
      })
      .finally(() => this.release(owner));
    return {
      accepted: active.acceptedPromise,
      completion,
      cancel: () => active.runner?.cancel(),
    };
  }

  private async executeTurn(
    caller: SpawnCaller,
    owner: SpawnOwner,
    params: PromptToAgentParams,
    active: ActiveTurn,
    signal?: AbortSignal
  ): Promise<PromptToAgentResult> {
    let hasPersistedSession = false;
    let hasPersistedTurn = false;

    try {
      if (signal?.aborted) {
        throw new SpawnServiceError("SPAWN_RPC_CANCELLED", "Spawn request was cancelled");
      }
      const snapshot = await this.requireParentSnapshot(caller);
      const agent = await this.requireInstalledAgent(params.agentId);
      await assertAgentWorkspaceCompatibility(agent.id, snapshot);

      let meta = await loadSpawnedSessionMeta(storeOwner(owner));
      let processEntry: Awaited<ReturnType<typeof getOrStartProcess>>;
      if (params.sessionId) {
        if (!meta) {
          return { status: "not_found", sessionId: owner.sessionId };
        }
        if (meta.agentId !== params.agentId) {
          throw new SpawnServiceError(
            "SPAWN_INVALID_REQUEST",
            "A spawned Session must continue with its original Agent"
          );
        }
        if (meta.status === "error" || meta.status === "expired") {
          return { status: "expired", sessionId: owner.sessionId };
        }
        const ready = getReadyProcess(meta.agentId);
        if (
          !ready ||
          meta.processGeneration !== ready.generation ||
          !meta.acpSessionId ||
          !hasActiveAcpSession(ready, meta.acpSessionId)
        ) {
          await patchSpawnedSessionMeta(storeOwner(owner), {
            status: "expired",
            updatedAt: this.nowIso(),
          });
          return { status: "expired", sessionId: owner.sessionId };
        }
        processEntry = ready;
      } else {
        processEntry = await getOrStartProcess(params.agentId);
        const now = this.nowIso();
        meta = {
          version: 1,
          ...owner,
          agentId: params.agentId,
          processGeneration: processEntry.generation,
          workspaceSnapshot: snapshot,
          status: "running",
          configOptions: [],
          turnCount: 0,
          tokenUsage: { used: 0, size: 0 },
          createdAt: now,
          updatedAt: now,
        };
        await writeSpawnedSessionMeta(meta);
      }
      hasPersistedSession = true;

      active.agentId = meta.agentId;
      await patchSpawnedSessionMeta(storeOwner(owner), {
        status: "running",
        error: undefined,
        updatedAt: this.nowIso(),
      });
      const turnUserMessage = userMessage(owner.sessionId, params.prompt, this.runtime.now());
      await appendSpawnedSessionMessage(storeOwner(owner), turnUserMessage);
      const turnRecord: SpawnedTurnRecord = {
        version: 1,
        ...owner,
        turnId: active.turnId,
        agentId: meta.agentId,
        mode: active.mode,
        phase: "starting",
        startedAt: active.startedAt,
        lastActivityAt: active.lastActivityAt,
        recentActivity: [],
        config: [],
        warnings: [],
        createdAt: active.startedAt,
        updatedAt: this.nowIso(),
      };
      await createSpawnedTurnRecord(turnRecord);
      hasPersistedTurn = true;
      this.scheduleViewWake(owner);

      const result = await this.runTurn({
        owner,
        meta,
        snapshot,
        processGeneration: processEntry.generation,
        prompt: params.prompt,
        userMessageId: turnUserMessage.id,
        config: params.config,
        active,
        signal,
      });
      const latest = await loadSpawnedSessionMeta(storeOwner(owner));
      if (latest) this.remember(latest);
      return result;
    } catch (error) {
      if (error instanceof SpawnServiceError) throw error;
      const candidate = error as { code?: unknown; message?: unknown };
      const message =
        typeof candidate.message === "string" ? candidate.message : "Spawn request failed";
      if (hasPersistedSession) {
        await patchSpawnedSessionMeta(storeOwner(owner), {
          status: "error",
          error: {
            code: typeof candidate.code === "string" ? candidate.code : "TURN_FAILED",
            message,
          },
          updatedAt: this.nowIso(),
        }).catch(() => undefined);
      }
      if (hasPersistedTurn) {
        await patchSpawnedTurnRecord(storeOwner(owner), active.turnId, {
          phase: "error",
          responseId: undefined,
          error: {
            code: typeof candidate.code === "string" ? candidate.code : "TURN_FAILED",
            message,
          },
          updatedAt: this.nowIso(),
        }).catch(() => undefined);
        this.scheduleViewWake(owner);
      }
      if (candidate.code === "SPAWN_INVALID_REQUEST") {
        throw new SpawnServiceError("SPAWN_INVALID_REQUEST", message);
      }
      const passthroughCodes = new Set<SpawnRpcErrorCode>([
        "SESSION_FOLDER_REMOVED",
        "SESSION_FOLDER_RELOCATED",
        "SESSION_FOLDER_PATH_MISSING",
        "PROMPT_CAPABILITY_MISMATCH",
      ]);
      if (
        typeof candidate.code === "string" &&
        passthroughCodes.has(candidate.code as SpawnRpcErrorCode)
      ) {
        throw new SpawnServiceError(candidate.code as SpawnRpcErrorCode, message);
      }
      throw new SpawnServiceError("SPAWN_INTERNAL_ERROR", message);
    }
  }

  async checkSessionStatus(
    caller: SpawnCaller,
    sessionId: string
  ): Promise<CheckSessionStatusResult> {
    await this.requireParentSnapshot(caller);
    const owner = { ...caller, sessionId };
    const active = this.activeTurns.get(ownerKey(owner));
    if (active) {
      return {
        status: "running",
        turnId: active.turnId,
        mode: active.mode,
        startedAt: active.startedAt,
        lastActivityAt: active.lastActivityAt,
        recentActivity: [...active.recentActivity],
      };
    }
    let meta = await loadSpawnedSessionMeta(storeOwner(owner));
    if (!meta) return { status: "not_found" };
    let latestTurn = await loadLatestSpawnedTurnRecord(storeOwner(owner));
    if (latestTurn && ["starting", "running", "cancelling"].includes(latestTurn.phase)) {
      await this.reconcileRestartState(caller.workspaceId);
      meta = await loadSpawnedSessionMeta(storeOwner(owner));
      if (!meta) return { status: "not_found" };
      latestTurn = await loadLatestSpawnedTurnRecord(storeOwner(owner));
    }
    if (latestTurn?.phase === "interrupted" && latestTurn.error) {
      if (!isInterruptedCode(latestTurn.error.code)) {
        return { status: "error", ...latestTurn.error };
      }
      const message =
        latestTurn.error.code === "APP_RESTARTED"
          ? SPAWN_APP_RESTARTED_MESSAGE
          : SPAWN_APP_SHUTDOWN_MESSAGE;
      return {
        status: "interrupted",
        code: latestTurn.error.code,
        message,
      };
    }
    if (latestTurn?.phase === "expired" && latestTurn.error?.code === "TURN_CANCELLED_BY_PARENT") {
      return { status: "error", ...latestTurn.error };
    }
    if (latestTurn?.phase === "expired") {
      return expiredStatus(SPAWN_ACTIVE_PROCESS_INVALIDATED_MESSAGE);
    }
    if (latestTurn?.phase === "error" && latestTurn.error) {
      return { status: "error", ...latestTurn.error };
    }
    if (meta.status === "error" && meta.error) {
      return { status: "error", ...meta.error };
    }
    if (meta.status === "expired") {
      return expiredStatus(
        latestTurn?.phase === "completed"
          ? SPAWN_COMPLETED_PROCESS_INVALIDATED_MESSAGE
          : SPAWN_PROCESS_INVALIDATED_FALLBACK_MESSAGE
      );
    }
    if (
      !meta.acpSessionId ||
      meta.processGeneration === undefined ||
      !this.isMetaProcessActive(meta)
    ) {
      return expiredStatus(
        latestTurn?.phase === "completed"
          ? SPAWN_COMPLETED_PROCESS_INVALIDATED_MESSAGE
          : SPAWN_PROCESS_INVALIDATED_FALLBACK_MESSAGE
      );
    }
    return {
      status: "idle",
      latestTurnId: latestTurn?.turnId,
      latestResponseId: meta.latestResponseId,
    };
  }

  isTurnLive(
    record: Pick<SpawnedTurnRecord, "workspaceId" | "parentSessionId" | "sessionId" | "turnId">
  ): boolean {
    const active = this.activeTurns.get(
      ownerKey({
        workspaceId: record.workspaceId,
        parentSessionId: record.parentSessionId,
        sessionId: record.sessionId,
      })
    );
    return active?.turnId === record.turnId;
  }

  async readResponse(caller: SpawnCaller, params: ReadResponseParams): Promise<ReadResponseResult> {
    await this.requireParentSnapshot(caller);
    const owner = { ...caller, sessionId: params.sessionId };
    const meta = await loadSpawnedSessionMeta(storeOwner(owner));
    if (!meta) throw new SpawnServiceError("SPAWN_NOT_FOUND", "Spawned Session not found");
    try {
      return await readSpawnedSessionResponseChunk({
        owner: storeOwner(owner),
        responseId: params.responseId,
        cursor: params.cursor,
        maxBytes: params.maxBytes,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new SpawnServiceError("SPAWN_NOT_FOUND", "Spawned response not found");
      }
      throw error;
    }
  }

  async cancelSession(
    caller: SpawnCaller,
    sessionId: string
  ): Promise<{ cancelled: boolean; reason?: string }> {
    await this.requireParentSnapshot(caller);
    const owner = { ...caller, sessionId };
    const active = this.activeTurns.get(ownerKey(owner));
    // Deliberately indistinguishable for missing, terminated, or cross-owner
    // sessions to avoid leaking information.
    if (!active) {
      return { cancelled: false, reason: "Session not found" };
    }
    active.forceError = {
      code: "TURN_CANCELLED_BY_PARENT",
      message: "Parent Agent cancelled this spawned session",
    };
    active.runner?.cancel();
    // Wait only: on grace-period timeout the turn keeps running until it
    // settles naturally; forceError still drives the terminal error code.
    await Promise.race([active.settledPromise, this.delay(SPAWN_TURN_CANCEL_GRACE_MS)]);
    return { cancelled: true };
  }

  async deleteParent(workspaceId: string, parentSessionId: string): Promise<void> {
    this.deletingParents.add(parentKey({ workspaceId, parentSessionId }));
    const prefix = `${workspaceId}\0${parentSessionId}\0`;
    const running = [...this.activeTurns.entries()].filter(([key]) => key.startsWith(prefix));
    for (const [, active] of running) {
      active.forceError = {
        code: "PARENT_SESSION_DELETED",
        message: "Parent Session was deleted",
      };
      active.runner?.cancel();
    }
    sessionRegistry.cancel("chat", `${workspaceId}:${parentSessionId}`);
    await Promise.race([
      Promise.all(running.map(([, active]) => active.settledPromise)).then(() => undefined),
      this.delay(SPAWN_TURN_CANCEL_GRACE_MS),
    ]);
    await spawnNotificationService.suppressParent(workspaceId, parentSessionId);
    fenceSpawnedSessionParent(workspaceId, parentSessionId);
    for (const [key] of this.liveEntries) {
      if (key.startsWith(prefix)) {
        const sessionId = key.slice(prefix.length);
        this.liveEntries.delete(key);
        this.scheduleViewWake({ workspaceId, parentSessionId, sessionId });
      }
    }
    for (const [, active] of running) this.scheduleViewWake(active.owner);
    await deleteSpawnedSessionParent(workspaceId, parentSessionId);
  }

  beginShutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    spawnNotificationService.beginShutdown();
    this.clearViewWakeTimers();
    for (const active of this.activeTurns.values()) {
      this.clearInactivityTimer(active);
      active.forceError = {
        code: "APP_SHUTDOWN",
        message: SPAWN_APP_SHUTDOWN_MESSAGE,
      };
      active.runner?.cancel();
    }
  }

  async dispose(): Promise<void> {
    this.beginShutdown();
    await Promise.allSettled([...this.activeTurns.values()].map((active) => active.settledPromise));
    beginSpawnedSessionStoreShutdown();
    this.activeTurns.clear();
    this.activeByParent.clear();
    this.liveEntries.clear();
    this.deletingParents.clear();
    this.disposeProcessInvalidation?.();
    this.disposeProcessInvalidation = null;
    this.viewWakeHandler = null;
  }

  forceDispose(): void {
    this.beginShutdown();
    beginSpawnedSessionStoreShutdown();
    this.activeTurns.clear();
    this.activeByParent.clear();
    this.liveEntries.clear();
    this.deletingParents.clear();
    this.disposeProcessInvalidation?.();
    this.disposeProcessInvalidation = null;
    this.viewWakeHandler = null;
  }

  private reserve(owner: SpawnOwner, mode: SpawnTurnMode): PromptToAgentResult | null {
    if (this.deletingParents.has(parentKey(owner))) {
      throw new SpawnServiceError(
        "SPAWN_PARENT_SESSION_NOT_FOUND",
        "Parent FylloCode Session is being deleted"
      );
    }
    const key = ownerKey(owner);
    const existing = this.activeTurns.get(key);
    if (existing) {
      return {
        status: "busy",
        sessionId: owner.sessionId,
        startedAt: existing.startedAt,
        lastActivityAt: existing.lastActivityAt,
      };
    }
    const parent = parentKey(owner);
    if (
      this.activeTurns.size >= MAX_ACTIVE_SPAWN_TURNS_GLOBAL ||
      (this.activeByParent.get(parent) ?? 0) >= MAX_ACTIVE_SPAWN_TURNS_PER_PARENT
    ) {
      return { status: "capacity_exceeded", code: "SPAWN_CAPACITY_EXCEEDED", retryable: true };
    }
    const now = this.nowIso();
    let timeoutResolve!: () => void;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutResolve = resolve;
    });
    let settledResolve!: () => void;
    const settledPromise = new Promise<void>((resolve) => {
      settledResolve = resolve;
    });
    let acceptedResolve!: (result: PromptToAgentResult) => void;
    let acceptedReject!: (error: unknown) => void;
    const acceptedPromise = new Promise<PromptToAgentResult>((resolve, reject) => {
      acceptedResolve = resolve;
      acceptedReject = reject;
    });
    void acceptedPromise.catch(() => undefined);
    this.activeTurns.set(key, {
      owner,
      turnId: randomUUID(),
      mode,
      startedAt: now,
      lastActivityAt: now,
      recentActivity: [],
      timeoutResolve,
      timeoutPromise,
      settledResolve,
      settledPromise,
      timedOut: false,
      acceptedSettled: false,
      acceptedSucceeded: false,
      acceptedResolve,
      acceptedReject,
      acceptedPromise,
      ...(mode === "background" ? { notificationId: randomUUID() } : {}),
    });
    this.activeByParent.set(parent, (this.activeByParent.get(parent) ?? 0) + 1);
    return null;
  }

  private release(owner: SpawnOwner): void {
    const active = this.activeTurns.get(ownerKey(owner));
    if (active) this.clearInactivityTimer(active);
    this.activeTurns.delete(ownerKey(owner));
    active?.settledResolve();
    const parent = parentKey(owner);
    const next = Math.max(0, (this.activeByParent.get(parent) ?? 1) - 1);
    if (next === 0) this.activeByParent.delete(parent);
    else this.activeByParent.set(parent, next);
  }

  private async requireParentSnapshot(caller: SpawnCaller): Promise<SessionWorkspaceSnapshot> {
    const meta = await loadSessionMeta(caller.workspaceId, caller.parentSessionId);
    if (!meta) {
      throw new SpawnServiceError(
        "SPAWN_PARENT_SESSION_NOT_FOUND",
        "Parent FylloCode Session not found"
      );
    }
    return ensureSessionWorkspaceSnapshot(caller.workspaceId, caller.parentSessionId);
  }

  private async requireInstalledAgent(agentId: string) {
    const [agent, installed] = await Promise.all([getAgentById(agentId), readInstalledRecords()]);
    if (!agent || (agent.source !== "custom" && installed[agentId] === undefined)) {
      throw new SpawnServiceError("SPAWN_AGENT_NOT_FOUND", `Agent is not installed: ${agentId}`);
    }
    return agent;
  }

  private async runTurn(input: {
    owner: SpawnOwner;
    meta: SpawnedSessionMeta;
    snapshot: SessionWorkspaceSnapshot;
    processGeneration: number;
    prompt: string;
    userMessageId: string;
    config?: Record<string, string | boolean>;
    active: ActiveTurn;
    signal?: AbortSignal;
  }): Promise<PromptToAgentResult> {
    const warnings: SpawnWarning[] = [];
    let configOptions = input.meta.configOptions;
    let latestUsage: TokenUsage | undefined;
    let finalizationError: unknown;
    let removeAbort = (): void => undefined;
    const responseId = randomUUID();
    const sessionStore = new SpawnedAcpSessionStore(input.owner, () => this.nowIso());
    const notification = (updatedAt: string) =>
      input.active.acceptedSucceeded && input.active.notificationId
        ? spawnNotificationService.pendingNotification(input.active.notificationId, updatedAt)
        : undefined;
    const settleAcceptedError = (code: string, message: string): void => {
      if (input.active.acceptedSettled) return;
      input.active.acceptedSettled = true;
      input.active.acceptedReject(Object.assign(new Error(message), { code }));
    };
    const patchTerminalTurn = async (patch: Partial<SpawnedTurnRecord>): Promise<void> => {
      const updatedAt = this.nowIso();
      const next = await patchSpawnedTurnRecord(storeOwner(input.owner), input.active.turnId, {
        lastActivityAt: input.active.lastActivityAt,
        recentActivity: [...input.active.recentActivity],
        config: summarizeConfig(configOptions),
        warnings: [...warnings],
        ...patch,
        ...(notification(updatedAt) ? { notification: notification(updatedAt) } : {}),
        updatedAt,
      });
      spawnNotificationService.terminalPersisted(next);
      this.scheduleViewWake(input.owner);
    };
    const sessionOpts: AcpSessionOpts = {
      fylloSessionId: input.owner.sessionId,
      agentId: input.meta.agentId,
      workspaceId: input.owner.workspaceId,
      projectPath: input.snapshot.cwd,
      cwd: input.snapshot.cwd,
      additionalDirectories: input.snapshot.additionalDirectories,
      workspaceSnapshot: input.snapshot,
      owner: "spawn",
      sessionStore,
      userMessageId: input.userMessageId,
      configOverrides: input.config,
      onConfigWarnings: (next) => {
        for (const warning of next) {
          if (
            !warnings.some(
              (existing) =>
                existing.optionId === warning.optionId && existing.message === warning.message
            )
          ) {
            warnings.push(warning);
          }
        }
      },
      onPromptDispatched: async ({ configOptions: dispatchedConfig }) => {
        configOptions = dispatchedConfig;
        const updatedAt = this.nowIso();
        await patchSpawnedSessionMeta(storeOwner(input.owner), {
          processGeneration: input.processGeneration,
          configOptions,
          updatedAt,
        });
        await patchSpawnedTurnRecord(storeOwner(input.owner), input.active.turnId, {
          phase: "running",
          config: summarizeConfig(configOptions),
          warnings: [...warnings],
          lastActivityAt: input.active.lastActivityAt,
          recentActivity: [...input.active.recentActivity],
          updatedAt,
        });
        this.scheduleViewWake(input.owner);
        const accepted: PromptToAgentAcceptedResult = {
          status: "accepted",
          sessionId: input.owner.sessionId,
          turnId: input.active.turnId,
          startedAt: input.active.startedAt,
          config: summarizeConfig(configOptions),
          warnings: [...warnings],
        };
        if (!input.active.acceptedSettled) {
          input.active.acceptedSucceeded = true;
          input.active.acceptedSettled = true;
          input.active.acceptedResolve(accepted);
        }
        if (input.active.mode === "background") removeAbort();
      },
    };
    const session = new AcpSession(sessionOpts);
    const runner = driveAcpTurn({
      session,
      owner: "spawn",
      registryKey: spawnSessionRegistryKey(
        input.owner.workspaceId,
        input.owner.parentSessionId,
        input.owner.sessionId
      ),
      messageSessionId: input.owner.sessionId,
      logTag: "spawn",
      runtimeScope: "app",
      start: () => session.start([{ type: "text", text: input.prompt }]),
      hooks: {
        onTurnMetadata: async (event) => {
          await patchSpawnedSessionMessageMetadata(storeOwner(input.owner), event.userMessageId, {
            updatedAt: new Date(event.dispatchedAt),
            ...(event.model === undefined ? {} : { model: event.model }),
            ...(event.effort === undefined ? {} : { effort: event.effort }),
          });
        },
        onContentEvent: (event, snapshot) => {
          input.active.liveAssistantMessage = snapshot ?? undefined;
          this.touch(input.active, event);
        },
        onControlEvent: (event) => {
          this.touch(input.active, event);
          if (event.kind === "config_options_update") configOptions = event.options;
          if (event.kind === "usage_update") {
            latestUsage = { used: event.used, size: event.size, cost: event.cost };
          }
        },
        onDone: async ({ totalTokens, message }) => {
          await input.active.acceptedPromise;
          try {
            if (message) await appendSpawnedSessionMessage(storeOwner(input.owner), message);
            const markdown = spawnedMessageToResponseMarkdown(message);
            await writeSpawnedSessionResponse(storeOwner(input.owner), responseId, markdown);
            await patchTerminalTurn({ phase: "completed", responseId, error: undefined });
            await patchSpawnedSessionMeta(storeOwner(input.owner), (current) => ({
              processGeneration: input.processGeneration,
              status: "idle",
              configOptions,
              turnCount: current.turnCount + 1,
              tokenUsage: latestUsage ?? {
                ...current.tokenUsage,
                used: current.tokenUsage.used + totalTokens,
              },
              latestResponseId: responseId,
              error: undefined,
              updatedAt: this.nowIso(),
            }));
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await patchTerminalTurn({
              phase: "error",
              responseId: undefined,
              error: { code: "TURN_PERSIST_FAILED", message },
            }).catch(() => undefined);
            throw error;
          }
        },
        onError: async ({ code, message, partialMessage }) => {
          settleAcceptedError(code, message);
          if (partialMessage) {
            await appendSpawnedSessionMessage(storeOwner(input.owner), partialMessage);
          }
          await patchTerminalTurn({ phase: "error", error: { code, message } });
          await patchSpawnedSessionMeta(storeOwner(input.owner), {
            status: "error",
            configOptions,
            error: { code, message },
            updatedAt: this.nowIso(),
          });
        },
        onCancel: async ({ partialMessage }) => {
          settleAcceptedError("SPAWN_RPC_CANCELLED", "Spawn request was cancelled");
          if (partialMessage) {
            await appendSpawnedSessionMessage(storeOwner(input.owner), partialMessage);
          }
          await patchTerminalTurn({
            phase: "error",
            error: { code: "TURN_CANCELLED", message: "Spawned turn was cancelled" },
          });
          await patchSpawnedSessionMeta(storeOwner(input.owner), {
            status: "error",
            error: { code: "TURN_CANCELLED", message: "Spawned turn was cancelled" },
            updatedAt: this.nowIso(),
          });
        },
        onFinalizationError: (error) => {
          finalizationError = error;
        },
      },
    });
    input.active.runner = runner;
    this.armInactivityTimer(input.active);

    const abortPromise = new Promise<never>((_resolve, reject) => {
      if (!input.signal) return;
      const onAbort = (): void => {
        runner.cancel();
        reject(new SpawnServiceError("SPAWN_RPC_CANCELLED", "Spawn request was cancelled"));
      };
      input.signal.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => input.signal?.removeEventListener("abort", onAbort);
      if (input.signal.aborted) onAbort();
    });

    const startPromise = runner.start();
    const startFailure = startPromise.then(
      () => new Promise<never>(() => undefined),
      (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error)))
    );
    const normalPromise = runner.completion.then((completion) => ({
      kind: "normal" as const,
      completion,
    }));
    const timeoutPromise = input.active.timeoutPromise.then(() => ({ kind: "timeout" as const }));

    try {
      const outcome = await Promise.race([
        normalPromise,
        timeoutPromise,
        abortPromise,
        startFailure,
      ]);
      if (outcome.kind === "timeout") {
        runner.cancel();
        const confirmed = await Promise.race([
          startPromise.then(
            () => true,
            () => true
          ),
          this.delay(SPAWN_TURN_CANCEL_GRACE_MS).then(() => false),
        ]);
        const code = confirmed ? "TURN_INACTIVITY_TIMEOUT" : "TURN_CANCEL_UNCONFIRMED";
        const message = confirmed
          ? "Spawned turn was cancelled after 10 minutes without ACP activity"
          : "Spawned turn did not confirm cancellation within 5 seconds";
        await patchTerminalTurn({ phase: "error", error: { code, message } });
        await patchSpawnedSessionMeta(storeOwner(input.owner), {
          status: "error",
          error: { code, message },
          updatedAt: this.nowIso(),
        });
        return { status: "error", sessionId: input.owner.sessionId, code, message };
      }

      if (input.active.forceError) {
        const interrupted = input.active.forceError.code === "APP_SHUTDOWN";
        const cancelledByParent = input.active.forceError.code === "TURN_CANCELLED_BY_PARENT";
        await patchTerminalTurn({
          phase: interrupted ? "interrupted" : "expired",
          error: input.active.forceError,
        });
        await patchSpawnedSessionMeta(storeOwner(input.owner), {
          status: interrupted || cancelledByParent ? "error" : "expired",
          error: input.active.forceError,
          updatedAt: this.nowIso(),
        });
        if (interrupted) {
          return {
            status: "error",
            sessionId: input.owner.sessionId,
            code: "APP_SHUTDOWN",
            message: input.active.forceError.message,
          };
        }
        if (cancelledByParent) {
          return {
            status: "error",
            sessionId: input.owner.sessionId,
            code: "TURN_CANCELLED_BY_PARENT",
            message: input.active.forceError.message,
          };
        }
        return input.active.forceError.code === "AGENT_PROCESS_INVALIDATED"
          ? {
              status: "expired",
              sessionId: input.owner.sessionId,
              code: "AGENT_PROCESS_INVALIDATED",
              message: input.active.forceError.message,
            }
          : { status: "expired", sessionId: input.owner.sessionId };
      }
      if (outcome.completion.status === "error") {
        if (
          outcome.completion.code === "SPAWN_INVALID_REQUEST" ||
          outcome.completion.code === "PROMPT_CAPABILITY_MISMATCH"
        ) {
          throw new SpawnServiceError(outcome.completion.code, outcome.completion.message);
        }
        return {
          status: "error",
          sessionId: input.owner.sessionId,
          code: "TURN_FAILED",
          message: outcome.completion.message,
        };
      }
      if (outcome.completion.status === "cancelled") {
        return {
          status: "error",
          sessionId: input.owner.sessionId,
          code: "TURN_FAILED",
          message: "Spawned turn was cancelled",
        };
      }
      if (finalizationError) {
        const message =
          finalizationError instanceof Error
            ? finalizationError.message
            : String(finalizationError);
        await patchSpawnedSessionMeta(storeOwner(input.owner), {
          status: "error",
          error: { code: "TURN_PERSIST_FAILED", message },
          updatedAt: this.nowIso(),
        });
        return {
          status: "error",
          sessionId: input.owner.sessionId,
          code: "TURN_PERSIST_FAILED",
          message,
        };
      }
      const markdown = spawnedMessageToResponseMarkdown(outcome.completion.message);
      const inline = inlineSpawnedResponse(markdown, responseId);
      return {
        status: "completed",
        sessionId: input.owner.sessionId,
        responseId,
        content: inline.content,
        truncated: !inline.done,
        nextCursor: inline.nextCursor,
        config: summarizeConfig(configOptions),
        warnings,
      };
    } finally {
      removeAbort();
      this.clearInactivityTimer(input.active);
    }
  }

  private touch(active: ActiveTurn, event: SessionEvent): void {
    const now = this.nowIso();
    active.lastActivityAt = now;
    const message =
      event.kind === "tool_call_start" || event.kind === "tool_call_update"
        ? event.title
        : undefined;
    active.recentActivity.push({ kind: event.kind, at: now, ...(message ? { message } : {}) });
    active.recentActivity.splice(0, Math.max(0, active.recentActivity.length - 3));
    this.armInactivityTimer(active);
    this.scheduleViewWake(active.owner);
  }

  private scheduleViewWake(owner: SpawnOwner): void {
    if (!this.viewWakeHandler || this.shuttingDown) return;
    const key = ownerKey(owner);
    if (this.viewWakeTimers.has(key)) return;
    const timer = this.runtime.setTimeout(() => {
      this.viewWakeTimers.delete(key);
      this.viewWakeHandler?.({
        workspaceId: owner.workspaceId,
        parentSessionId: owner.parentSessionId,
        sessionId: owner.sessionId,
      });
    }, 40);
    timer.unref();
    this.viewWakeTimers.set(key, timer);
  }

  private clearViewWakeTimers(): void {
    for (const timer of this.viewWakeTimers.values()) this.runtime.clearTimeout(timer);
    this.viewWakeTimers.clear();
  }

  private armInactivityTimer(active: ActiveTurn): void {
    this.clearInactivityTimer(active);
    const timer = this.runtime.setTimeout(() => {
      active.timedOut = true;
      active.timeoutResolve();
    }, SPAWN_TURN_INACTIVITY_TIMEOUT_MS);
    timer.unref();
    active.inactivityTimer = timer;
  }

  private clearInactivityTimer(active: ActiveTurn): void {
    if (active.inactivityTimer) this.runtime.clearTimeout(active.inactivityTimer);
    active.inactivityTimer = undefined;
  }

  private remember(meta: SpawnedSessionMeta): void {
    const key = ownerKey({
      workspaceId: meta.workspaceId,
      parentSessionId: meta.parentSessionId,
      sessionId: meta.sessionId,
    });
    this.liveEntries.set(key, { meta, lastAccessedAt: this.runtime.now().getTime() });
    const siblings = [...this.liveEntries.entries()]
      .filter(
        ([, entry]) =>
          entry.meta.workspaceId === meta.workspaceId &&
          entry.meta.parentSessionId === meta.parentSessionId &&
          entry.meta.status === "idle"
      )
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt);
    while (siblings.length > MAX_RESIDENT_IDLE_SPAWNED_SESSIONS_PER_PARENT) {
      const oldest = siblings.shift();
      if (oldest) this.liveEntries.delete(oldest[0]);
    }
  }

  private isMetaProcessActive(meta: SpawnedSessionMeta): boolean {
    const ready = getReadyProcess(meta.agentId);
    return Boolean(
      ready &&
      ready.generation === meta.processGeneration &&
      meta.acpSessionId &&
      hasActiveAcpSession(ready, meta.acpSessionId)
    );
  }

  private reconcileRestartState(workspaceId: string): Promise<void> {
    const existing = this.restartReconciliations.get(workspaceId);
    if (existing) return existing;
    const pending = spawnNotificationService
      .reconcileWorkspace(workspaceId, (record) => this.isTurnLive(record))
      .finally(() => {
        this.restartReconciliations.delete(workspaceId);
      });
    this.restartReconciliations.set(workspaceId, pending);
    return pending;
  }

  private invalidateAgent(agentId: string): void {
    for (const active of this.activeTurns.values()) {
      if (active.agentId !== agentId) continue;
      active.forceError = {
        code: "AGENT_PROCESS_INVALIDATED",
        message: SPAWN_ACTIVE_PROCESS_INVALIDATED_MESSAGE,
      };
      active.runner?.cancel();
    }
    for (const entry of this.liveEntries.values()) {
      if (entry.meta.agentId !== agentId) continue;
      const message =
        entry.meta.status === "idle"
          ? SPAWN_COMPLETED_PROCESS_INVALIDATED_MESSAGE
          : entry.meta.status === "running"
            ? SPAWN_ACTIVE_PROCESS_INVALIDATED_MESSAGE
            : SPAWN_PROCESS_INVALIDATED_FALLBACK_MESSAGE;
      entry.meta = {
        ...entry.meta,
        status: "expired",
        error: { code: "AGENT_PROCESS_INVALIDATED", message },
        updatedAt: this.nowIso(),
      };
      void patchSpawnedSessionMeta(
        storeOwner({
          workspaceId: entry.meta.workspaceId,
          parentSessionId: entry.meta.parentSessionId,
          sessionId: entry.meta.sessionId,
        }),
        entry.meta
      ).catch(() => undefined);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.runtime.setTimeout(resolve, ms);
      timer.unref();
    });
  }

  private nowIso(): string {
    return this.runtime.now().toISOString();
  }
}

export const spawnedSessionManager = new SpawnedSessionManager();
