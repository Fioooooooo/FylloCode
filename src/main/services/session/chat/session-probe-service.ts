import type { ClientSideConnection, SessionNotification } from "@agentclientprotocol/sdk";
import { DEFAULT_CHAT_SESSION_MODE, type ChatSessionMode } from "@shared/types/chat";
import type { ProbeSnapshot } from "@shared/types/chat-probe";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import {
  clearPendingProbeHandler,
  forgetActiveAcpSession,
  getOrStartProcess,
  getReadyProcess,
  hasActiveMcpActivation,
  markAcpSessionActive,
  onAgentProcessInvalidated,
  setPendingProbeHandler,
} from "@main/infra/process/acp-process-pool";
import { newSessionId } from "@main/infra/ids";
import logger from "@main/infra/logger";
import { valueExistsInSchema } from "@main/domain/session/chat/session-config-recovery";
import { normalizeAcpSessionConfigOptions, normalizeAvailableCommands } from "./acp-mapper";
import { buildPayload, isMethodNotFoundError } from "./acp-config-option-rpc";
import type { ProbeEntry } from "./session-probe-registry";
import { sessionProbeRegistry, toProbeSnapshot } from "./session-probe-registry";
import { sessionProbeBus } from "./session-probe-bus";
import { createChatRuntimeProfile } from "./session-runtime-profile";

type AgentProcessEntry = Awaited<ReturnType<typeof getOrStartProcess>>;
type ProbeNotificationHandler = (notification: SessionNotification) => void;

export interface SetProbeConfigOptionInput {
  workspaceId: string;
  agentId: string;
  sessionMode?: ChatSessionMode;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
}

export function getProbeWorkspaceSnapshotForPromotion(
  workspaceId: string,
  agentId: string,
  acpSessionId: string,
  sessionMode?: ChatSessionMode
): SessionWorkspaceSnapshot | null {
  return (
    sessionProbeRegistry.getForPromotion(workspaceId, agentId, acpSessionId, sessionMode)
      ?.workspaceSnapshot ?? null
  );
}

const probeHandlersByKey = new Map<string, ProbeNotificationHandler>();
const probeStartTailsByAgent = new Map<string, Promise<void>>();

function probeKey(workspaceId: string, agentId: string): string {
  return `${workspaceId}::${agentId}`;
}

async function runSerializedProbeStart<T>(agentId: string, task: () => Promise<T>): Promise<T> {
  const previousTail = probeStartTailsByAgent.get(agentId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const currentTail = previousTail
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          releaseCurrent = resolve;
        })
    );

  probeStartTailsByAgent.set(agentId, currentTail);
  await previousTail.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();
    if (probeStartTailsByAgent.get(agentId) === currentTail) {
      probeStartTailsByAgent.delete(agentId);
    }
  }
}

function detachProbeFallback(
  workspaceId: string,
  agentId: string
): ProbeNotificationHandler | null {
  const key = probeKey(workspaceId, agentId);
  const handler = probeHandlersByKey.get(key) ?? null;
  probeHandlersByKey.delete(key);
  if (handler) {
    clearPendingProbeHandler(agentId, handler);
  } else {
    clearPendingProbeHandler(agentId);
  }
  return handler;
}

async function clearProbeSessionHandler(agentId: string, acpSessionId: string): Promise<void> {
  try {
    const processEntry = await getProcess(agentId);
    processEntry.sessionHandlers.delete(acpSessionId);
  } catch (error: unknown) {
    logger.warn(
      `[chat-probe] failed to clear probe session handler for agent=${agentId} acp=${acpSessionId}`,
      error
    );
  }
}

function normalizeError(error: unknown): { code: string; message: string } {
  const candidate = error as Error & { code?: string };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : IpcErrorCodes.ACP_ERROR,
    message: candidate?.message ?? String(error),
  };
}

function normalizeIpcErrorCode(code: string | undefined): IpcErrorCode {
  const knownCodes = Object.values(IpcErrorCodes) as string[];
  return code && knownCodes.includes(code) ? (code as IpcErrorCode) : IpcErrorCodes.ACP_ERROR;
}

function emitUpdate(
  workspaceId: string,
  agentId: string,
  sessionMode: ChatSessionMode,
  snapshot: ProbeSnapshot | null
): void {
  sessionProbeBus.emitUpdate({ workspaceId, agentId, sessionMode, snapshot });
}

function setFailedEntry(
  workspaceId: string,
  agentId: string,
  sessionMode: ChatSessionMode,
  error: unknown,
  workspaceSnapshot: SessionWorkspaceSnapshot,
  fylloSessionId = newSessionId()
): ProbeEntry {
  const entry: ProbeEntry = {
    workspaceId,
    agentId,
    sessionMode,
    status: "failed",
    fylloSessionId,
    acpSessionId: null,
    mcpActivationId: null,
    configOptions: [],
    availableCommands: [],
    workspaceSnapshot,
    error: normalizeError(error),
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(workspaceId, agentId, entry);
  emitUpdate(workspaceId, agentId, sessionMode, toProbeSnapshot(entry));
  return entry;
}

/**
 * Build the probe-only fallback handler for a given agent. It only reacts to
 * session-level metadata (available_commands_update); all message-stream events
 * (agent_message_chunk, tool_call, etc.) are ignored because the draft idle
 * window never carries them. On a command update it normalizes the commands,
 * patches the current registry entry, and broadcasts the new snapshot.
 */
function createProbeHandler(
  workspaceId: string,
  agentId: string,
  sessionMode: ChatSessionMode
): (notification: SessionNotification) => void {
  return (notification: SessionNotification): void => {
    if (notification.update.sessionUpdate !== "available_commands_update") {
      return;
    }
    const entry = sessionProbeRegistry.get(workspaceId, agentId);
    if (!entry || entry.sessionMode !== sessionMode) {
      return;
    }
    entry.availableCommands = normalizeAvailableCommands(notification.update);
    sessionProbeRegistry.set(workspaceId, agentId, entry);
    emitUpdate(workspaceId, agentId, sessionMode, toProbeSnapshot(entry));
  };
}

async function getProcess(agentId: string): Promise<AgentProcessEntry> {
  try {
    return await getOrStartProcess(agentId);
  } catch (error: unknown) {
    const e = error as Error & { code?: string };
    throw ipcError(
      e.code === IpcErrorCodes.ACP_NOT_READY || e.code === IpcErrorCodes.ACP_EXIT_GIVEUP
        ? e.code
        : IpcErrorCodes.ACP_ERROR,
      e.message ?? "Failed to acquire ACP process"
    );
  }
}

async function getConnection(agentId: string): Promise<ClientSideConnection> {
  const entry = await getProcess(agentId);
  return entry.connection;
}

export function ensureProbe(
  workspaceId: string,
  agentId: string,
  sessionMode: ChatSessionMode,
  workspaceSnapshot: SessionWorkspaceSnapshot
): Promise<ProbeSnapshot>;
export function ensureProbe(
  workspaceId: string,
  agentId: string,
  workspaceSnapshot: SessionWorkspaceSnapshot,
  sessionMode?: ChatSessionMode
): Promise<ProbeSnapshot>;
export async function ensureProbe(
  workspaceId: string,
  agentId: string,
  sessionModeOrSnapshot: ChatSessionMode | SessionWorkspaceSnapshot,
  snapshotOrSessionMode?: SessionWorkspaceSnapshot | ChatSessionMode
): Promise<ProbeSnapshot> {
  const sessionMode =
    typeof sessionModeOrSnapshot === "string"
      ? sessionModeOrSnapshot
      : typeof snapshotOrSessionMode === "string"
        ? snapshotOrSessionMode
        : DEFAULT_CHAT_SESSION_MODE;
  const workspaceSnapshot =
    typeof sessionModeOrSnapshot === "string"
      ? (snapshotOrSessionMode as SessionWorkspaceSnapshot)
      : sessionModeOrSnapshot;
  const workspaceCwd = workspaceSnapshot.cwd;
  let existing = sessionProbeRegistry.get(workspaceId, agentId);
  if (existing && existing.sessionMode !== sessionMode) {
    await closeProbe(workspaceId, agentId, existing.sessionMode);
    existing = undefined;
  }
  if (existing?.status === "ready") {
    const processEntry = await getProcess(agentId);
    if (
      existing.acpSessionId !== null &&
      hasActiveMcpActivation(processEntry, existing.acpSessionId)
    ) {
      return toProbeSnapshot(existing);
    }
    await closeProbe(workspaceId, agentId, sessionMode);
  }
  if (existing?.status === "starting" && existing.inflightEnsure) {
    return toProbeSnapshot(await existing.inflightEnsure);
  }

  const startingEntry: ProbeEntry = {
    workspaceId,
    agentId,
    sessionMode,
    status: "starting",
    fylloSessionId: newSessionId(),
    acpSessionId: null,
    mcpActivationId: null,
    configOptions: [],
    availableCommands: [],
    workspaceSnapshot,
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(workspaceId, agentId, startingEntry);
  logger.info(
    `[chat-probe] starting workspace=${workspaceId} agent=${agentId} mode=${sessionMode} fyllo=${startingEntry.fylloSessionId}`
  );

  const inflightEnsure = (async (): Promise<ProbeEntry> => {
    const probeHandler = createProbeHandler(workspaceId, agentId, sessionMode);
    probeHandlersByKey.set(probeKey(workspaceId, agentId), probeHandler);
    try {
      const processEntry = await getProcess(agentId);
      const supportsHttp =
        processEntry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;
      const runtimeProfile = await createChatRuntimeProfile({
        sessionMode,
        agentId,
        workspaceSnapshot,
        fylloSessionId: startingEntry.fylloSessionId,
        supportsHttp,
      });
      let activationBound = false;
      let response: Awaited<ReturnType<ClientSideConnection["newSession"]>>;
      try {
        response = await runSerializedProbeStart(agentId, async () => {
          // Register the probe handler BEFORE newSession: claude-acp pushes
          // available_commands_update via setTimeout(0) right after newSession
          // returns, so the handler must already be in place to catch it. Probe
          // starts are serialized per agent because fallback notifications do not
          // have a known session handler until newSession returns.
          setPendingProbeHandler(agentId, probeHandler);
          try {
            const createdSession = await processEntry.connection.newSession({
              cwd: workspaceCwd,
              additionalDirectories: workspaceSnapshot.additionalDirectories,
              mcpServers: runtimeProfile.mcpServers,
            });
            markAcpSessionActive(
              processEntry,
              createdSession.sessionId,
              runtimeProfile.mcpActivationId
            );
            activationBound = true;
            processEntry.sessionHandlers.set(createdSession.sessionId, probeHandler);
            clearPendingProbeHandler(agentId, probeHandler);
            return createdSession;
          } catch (error: unknown) {
            detachProbeFallback(workspaceId, agentId);
            throw error;
          }
        });
      } finally {
        if (!activationBound) {
          runtimeProfile.revoke();
        }
      }
      const current = sessionProbeRegistry.get(workspaceId, agentId);
      if (current !== startingEntry) {
        processEntry.sessionHandlers.delete(response.sessionId);
        forgetActiveAcpSession(processEntry, response.sessionId);
        await processEntry.connection.closeSession({ sessionId: response.sessionId }).catch(() => {
          /* invalidation already owns process teardown */
        });
        throw ipcError(IpcErrorCodes.ACP_NOT_READY, `Probe for ${agentId} was invalidated`);
      }
      const readyEntry: ProbeEntry = {
        workspaceId,
        agentId,
        sessionMode,
        status: "ready",
        fylloSessionId: startingEntry.fylloSessionId,
        acpSessionId: response.sessionId,
        mcpActivationId: runtimeProfile.mcpActivationId,
        configOptions: normalizeAcpSessionConfigOptions(response.configOptions),
        // Carry whatever the probe handler has already accumulated. The commands
        // usually arrive asynchronously after newSession returns, so this is
        // often still [] here; the handler re-emits once they land.
        availableCommands: current?.availableCommands ?? [],
        workspaceSnapshot,
        startedAt: startingEntry.startedAt,
      };
      sessionProbeRegistry.set(workspaceId, agentId, readyEntry);
      logger.info(
        `[chat-probe] ready workspace=${workspaceId} agent=${agentId} mode=${sessionMode} fyllo=${readyEntry.fylloSessionId} acp=${readyEntry.acpSessionId} configOptions=${readyEntry.configOptions.length} durationMs=${Date.now() - readyEntry.startedAt}`
      );
      emitUpdate(workspaceId, agentId, sessionMode, toProbeSnapshot(readyEntry));
      return readyEntry;
    } catch (error: unknown) {
      detachProbeFallback(workspaceId, agentId);
      if (sessionProbeRegistry.get(workspaceId, agentId) !== startingEntry) {
        const normalized = normalizeError(error);
        throw ipcError(normalizeIpcErrorCode(normalized.code), normalized.message);
      }
      const failedEntry = setFailedEntry(
        workspaceId,
        agentId,
        sessionMode,
        error,
        workspaceSnapshot,
        startingEntry.fylloSessionId
      );
      throw ipcError(
        normalizeIpcErrorCode(failedEntry.error?.code),
        failedEntry.error?.message ?? "Failed to ensure probe"
      );
    }
  })();

  startingEntry.inflightEnsure = inflightEnsure;
  return toProbeSnapshot(await inflightEnsure);
}

export async function closeProbe(
  workspaceId: string,
  agentId: string,
  expectedSessionMode?: ChatSessionMode
): Promise<void> {
  const current = sessionProbeRegistry.get(workspaceId, agentId);
  if (current && expectedSessionMode !== undefined && current.sessionMode !== expectedSessionMode) {
    return;
  }
  const entry = sessionProbeRegistry.delete(workspaceId, agentId);
  // Always clear the probe fallback handler so it does not leak after close,
  // even when no ready session exists to close.
  detachProbeFallback(workspaceId, agentId);
  emitUpdate(
    workspaceId,
    agentId,
    entry?.sessionMode ?? expectedSessionMode ?? DEFAULT_CHAT_SESSION_MODE,
    null
  );
  if (!entry || entry.status !== "ready" || entry.acpSessionId === null) {
    return;
  }

  const processEntry = getReadyProcess(agentId);
  if (!processEntry) return;

  try {
    processEntry.sessionHandlers.delete(entry.acpSessionId);
    forgetActiveAcpSession(processEntry, entry.acpSessionId);
    await processEntry.connection.closeSession({ sessionId: entry.acpSessionId });
  } catch (error: unknown) {
    logger.error(`[chat-probe] closeSession failed for agent=${agentId}`, error);
  }
}

export async function closeWorkspaceProbes(workspaceId: string): Promise<void> {
  const entries = sessionProbeRegistry.deleteWorkspace(workspaceId);

  await Promise.all(
    entries.map(async (entry) => {
      detachProbeFallback(entry.workspaceId, entry.agentId);
      if (entry.status !== "ready" || entry.acpSessionId === null) {
        return;
      }

      const processEntry = getReadyProcess(entry.agentId);
      if (!processEntry) return;

      try {
        processEntry.sessionHandlers.delete(entry.acpSessionId);
        forgetActiveAcpSession(processEntry, entry.acpSessionId);
        await processEntry.connection.closeSession({ sessionId: entry.acpSessionId });
      } catch (error: unknown) {
        logger.error(
          `[chat-probe] closeSession failed for workspace=${workspaceId} agent=${entry.agentId}`,
          error
        );
      }
    })
  );
}

/**
 * 在 ACP process pool terminate 前失效并关闭所有 draft probe，避免窗口销毁阶段再发起清理 RPC。
 */
export async function disposeSessionProbes(): Promise<void> {
  const entries = sessionProbeRegistry.deleteAll();

  await Promise.all(
    entries.map(async (entry) => {
      detachProbeFallback(entry.workspaceId, entry.agentId);
      if (entry.status === "starting") {
        await entry.inflightEnsure?.catch(() => undefined);
        return;
      }
      if (entry.status !== "ready" || entry.acpSessionId === null) return;

      const processEntry = getReadyProcess(entry.agentId);
      if (!processEntry) return;

      processEntry.sessionHandlers.delete(entry.acpSessionId);
      forgetActiveAcpSession(processEntry, entry.acpSessionId);
      await processEntry.connection
        .closeSession({ sessionId: entry.acpSessionId })
        .catch((error: unknown) => {
          logger.error(
            `[chat-probe] closeSession failed during shutdown for workspace=${entry.workspaceId} agent=${entry.agentId}`,
            error
          );
        });
    })
  );
}

export async function takeProbeFor(
  workspaceId: string,
  agentId: string,
  expectedAcpSessionId: string,
  expectedSessionMode?: ChatSessionMode
): Promise<ProbeEntry | null> {
  const entry = sessionProbeRegistry.takeFor(
    workspaceId,
    agentId,
    expectedAcpSessionId,
    expectedSessionMode
  );
  if (!entry) {
    return null;
  }

  detachProbeFallback(workspaceId, agentId);
  if (entry.acpSessionId) {
    await clearProbeSessionHandler(agentId, entry.acpSessionId);
  }

  return entry;
}

export async function setProbeConfigOption(
  input: SetProbeConfigOptionInput
): Promise<ProbeSnapshot> {
  const entry = sessionProbeRegistry.get(input.workspaceId, input.agentId);
  if (!entry || entry.status !== "ready" || entry.acpSessionId === null) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe 未就绪");
  }
  if (input.sessionMode !== undefined && entry.sessionMode !== input.sessionMode) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe sessionMode 与当前 entry 不匹配");
  }

  const schema = entry.configOptions.find((option) => option.id === input.configId);
  if (schema) {
    if (schema.type !== input.type) {
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Config option ${input.configId} type mismatch: expected ${schema.type}, got ${input.type}`
      );
    }
    if (!valueExistsInSchema(schema, input.value)) {
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Value is not in the schema for config option ${input.configId}`
      );
    }
  }

  const connection = await getConnection(input.agentId);
  let response;
  try {
    response = await connection.setSessionConfigOption({
      sessionId: entry.acpSessionId,
      configId: input.configId,
      ...buildPayload(input.type, input.value),
    } as Parameters<ClientSideConnection["setSessionConfigOption"]>[0]);
  } catch (error: unknown) {
    if (isMethodNotFoundError(error)) {
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_NOT_SUPPORTED,
        "Agent does not implement session/set_config_option"
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw ipcError(IpcErrorCodes.ACP_ERROR, message);
  }

  entry.configOptions = normalizeAcpSessionConfigOptions(response.configOptions);
  const snapshot = toProbeSnapshot(entry);
  emitUpdate(input.workspaceId, input.agentId, entry.sessionMode, snapshot);
  return snapshot;
}

export function getProbeSnapshot(workspaceId: string, agentId: string): ProbeSnapshot | null {
  const entry = sessionProbeRegistry.get(workspaceId, agentId);
  return entry ? toProbeSnapshot(entry) : null;
}

onAgentProcessInvalidated(({ agentId }) => {
  probeStartTailsByAgent.delete(agentId);
  const removed = sessionProbeRegistry.deleteAgent(agentId);
  for (const entry of removed) {
    detachProbeFallback(entry.workspaceId, agentId);
    emitUpdate(entry.workspaceId, agentId, entry.sessionMode, null);
  }
});
