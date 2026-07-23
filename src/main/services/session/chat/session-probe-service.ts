import type { ClientSideConnection, SessionNotification } from "@agentclientprotocol/sdk";
import type { ProbeSnapshot } from "@shared/types/chat-probe";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import {
  clearPendingProbeHandler,
  getOrStartProcess,
  onAgentUnavailable,
  setPendingProbeHandler,
} from "@main/infra/process/acp-process-pool";
import { resolveBundledMcpServers, toAcpMcpServer } from "@main/infra/mcp/bundled-mcp-servers";
import { newSessionId } from "@main/infra/ids";
import logger from "@main/infra/logger";
import { normalizeAcpSessionConfigOptions, normalizeAvailableCommands } from "./acp-mapper";
import { buildPayload, isMethodNotFoundError, valueExistsInSchema } from "./acp-config-option-rpc";
import type { ProbeEntry } from "./session-probe-registry";
import { sessionProbeRegistry, toProbeSnapshot } from "./session-probe-registry";
import { sessionProbeBus } from "./session-probe-bus";

type AgentProcessEntry = Awaited<ReturnType<typeof getOrStartProcess>>;
type ProbeNotificationHandler = (notification: SessionNotification) => void;

export interface SetProbeConfigOptionInput {
  projectId: string;
  agentId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
}

const probeHandlersByKey = new Map<string, ProbeNotificationHandler>();
const probeStartTailsByAgent = new Map<string, Promise<void>>();

function probeKey(projectId: string, agentId: string): string {
  return `${projectId}::${agentId}`;
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

function detachProbeFallback(projectId: string, agentId: string): ProbeNotificationHandler | null {
  const key = probeKey(projectId, agentId);
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

function emitUpdate(projectId: string, agentId: string, snapshot: ProbeSnapshot | null): void {
  sessionProbeBus.emitUpdate({ projectId, agentId, snapshot });
}

function setFailedEntry(
  projectId: string,
  agentId: string,
  error: unknown,
  fylloSessionId = newSessionId()
): ProbeEntry {
  const entry: ProbeEntry = {
    projectId,
    agentId,
    status: "failed",
    fylloSessionId,
    acpSessionId: null,
    configOptions: [],
    availableCommands: [],
    error: normalizeError(error),
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(projectId, agentId, entry);
  emitUpdate(projectId, agentId, toProbeSnapshot(entry));
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
  projectId: string,
  agentId: string
): (notification: SessionNotification) => void {
  return (notification: SessionNotification): void => {
    if (notification.update.sessionUpdate !== "available_commands_update") {
      return;
    }
    const entry = sessionProbeRegistry.get(projectId, agentId);
    if (!entry) {
      return;
    }
    entry.availableCommands = normalizeAvailableCommands(notification.update);
    sessionProbeRegistry.set(projectId, agentId, entry);
    emitUpdate(projectId, agentId, toProbeSnapshot(entry));
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

export async function ensureProbe(
  projectId: string,
  agentId: string,
  projectPath: string
): Promise<ProbeSnapshot> {
  const existing = sessionProbeRegistry.get(projectId, agentId);
  if (existing?.status === "ready") {
    return toProbeSnapshot(existing);
  }
  if (existing?.status === "starting" && existing.inflightEnsure) {
    return toProbeSnapshot(await existing.inflightEnsure);
  }

  const startingEntry: ProbeEntry = {
    projectId,
    agentId,
    status: "starting",
    fylloSessionId: newSessionId(),
    acpSessionId: null,
    configOptions: [],
    availableCommands: [],
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(projectId, agentId, startingEntry);

  const inflightEnsure = (async (): Promise<ProbeEntry> => {
    const probeHandler = createProbeHandler(projectId, agentId);
    probeHandlersByKey.set(probeKey(projectId, agentId), probeHandler);
    try {
      const processEntry = await getProcess(agentId);
      const supportsHttp =
        processEntry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;
      const mcpServers = (
        await resolveBundledMcpServers({
          projectPath,
          fylloSessionId: startingEntry.fylloSessionId,
          supportsHttp,
        })
      ).map(toAcpMcpServer);
      const response = await runSerializedProbeStart(agentId, async () => {
        // Register the probe handler BEFORE newSession: claude-acp pushes
        // available_commands_update via setTimeout(0) right after newSession
        // returns, so the handler must already be in place to catch it. Probe
        // starts are serialized per agent because fallback notifications do not
        // have a known session handler until newSession returns.
        setPendingProbeHandler(agentId, probeHandler);
        try {
          const createdSession = await processEntry.connection.newSession({
            cwd: projectPath,
            mcpServers,
          });
          processEntry.sessionHandlers.set(createdSession.sessionId, probeHandler);
          clearPendingProbeHandler(agentId, probeHandler);
          return createdSession;
        } catch (error: unknown) {
          detachProbeFallback(projectId, agentId);
          throw error;
        }
      });
      const current = sessionProbeRegistry.get(projectId, agentId);
      const readyEntry: ProbeEntry = {
        projectId,
        agentId,
        status: "ready",
        fylloSessionId: startingEntry.fylloSessionId,
        acpSessionId: response.sessionId,
        configOptions: normalizeAcpSessionConfigOptions(response.configOptions),
        // Carry whatever the probe handler has already accumulated. The commands
        // usually arrive asynchronously after newSession returns, so this is
        // often still [] here; the handler re-emits once they land.
        availableCommands: current?.availableCommands ?? [],
        startedAt: startingEntry.startedAt,
      };
      sessionProbeRegistry.set(projectId, agentId, readyEntry);
      emitUpdate(projectId, agentId, toProbeSnapshot(readyEntry));
      return readyEntry;
    } catch (error: unknown) {
      detachProbeFallback(projectId, agentId);
      const failedEntry = setFailedEntry(projectId, agentId, error, startingEntry.fylloSessionId);
      throw ipcError(
        normalizeIpcErrorCode(failedEntry.error?.code),
        failedEntry.error?.message ?? "Failed to ensure probe"
      );
    }
  })();

  startingEntry.inflightEnsure = inflightEnsure;
  return toProbeSnapshot(await inflightEnsure);
}

export async function closeProbe(projectId: string, agentId: string): Promise<void> {
  const entry = sessionProbeRegistry.delete(projectId, agentId);
  // Always clear the probe fallback handler so it does not leak after close,
  // even when no ready session exists to close.
  detachProbeFallback(projectId, agentId);
  emitUpdate(projectId, agentId, null);
  if (!entry || entry.status !== "ready" || entry.acpSessionId === null) {
    return;
  }

  try {
    const processEntry = await getProcess(agentId);
    processEntry.sessionHandlers.delete(entry.acpSessionId);
    await processEntry.connection.closeSession({ sessionId: entry.acpSessionId });
  } catch (error: unknown) {
    logger.error(`[chat-probe] closeSession failed for agent=${agentId}`, error);
  }
}

export async function closeProjectProbes(projectId: string): Promise<void> {
  const entries = sessionProbeRegistry.deleteProject(projectId);

  await Promise.all(
    entries.map(async (entry) => {
      detachProbeFallback(entry.projectId, entry.agentId);
      if (entry.status !== "ready" || entry.acpSessionId === null) {
        return;
      }

      try {
        const processEntry = await getProcess(entry.agentId);
        processEntry.sessionHandlers.delete(entry.acpSessionId);
        await processEntry.connection.closeSession({ sessionId: entry.acpSessionId });
      } catch (error: unknown) {
        logger.error(
          `[chat-probe] closeSession failed for project=${projectId} agent=${entry.agentId}`,
          error
        );
      }
    })
  );
}

export async function takeProbeFor(
  projectId: string,
  agentId: string,
  expectedAcpSessionId: string
): Promise<ProbeEntry | null> {
  const entry = sessionProbeRegistry.takeFor(projectId, agentId, expectedAcpSessionId);
  if (!entry) {
    return null;
  }

  detachProbeFallback(projectId, agentId);
  if (entry.acpSessionId) {
    await clearProbeSessionHandler(agentId, entry.acpSessionId);
  }

  return entry;
}

export async function setProbeConfigOption(
  input: SetProbeConfigOptionInput
): Promise<ProbeSnapshot> {
  const entry = sessionProbeRegistry.get(input.projectId, input.agentId);
  if (!entry || entry.status !== "ready" || entry.acpSessionId === null) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe 未就绪");
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
  emitUpdate(input.projectId, input.agentId, snapshot);
  return snapshot;
}

export function getProbeSnapshot(projectId: string, agentId: string): ProbeSnapshot | null {
  const entry = sessionProbeRegistry.get(projectId, agentId);
  return entry ? toProbeSnapshot(entry) : null;
}

onAgentUnavailable(({ agentId }) => {
  for (const key of sessionProbeRegistry.keys()) {
    const [projectId, entryAgentId] = key.split("::", 2);
    if (!projectId || entryAgentId !== agentId) {
      continue;
    }

    const removed = sessionProbeRegistry.delete(projectId, agentId);
    if (removed) {
      detachProbeFallback(projectId, agentId);
      emitUpdate(projectId, agentId, null);
    }
  }
});
