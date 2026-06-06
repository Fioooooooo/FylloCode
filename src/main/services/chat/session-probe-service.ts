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
import { getBundledMcpServers, toAcpMcpServerEnv } from "@main/infra/mcp/bundled-mcp-servers";
import logger from "@main/infra/logger";
import { normalizeAcpSessionConfigOptions, normalizeAvailableCommands } from "./acp-mapper";
import { buildPayload, isMethodNotFoundError, valueExistsInSchema } from "./acp-config-option-rpc";
import type { ProbeEntry } from "./session-probe-registry";
import { sessionProbeRegistry, toProbeSnapshot } from "./session-probe-registry";
import { sessionProbeBus } from "./session-probe-bus";

export interface SetProbeConfigOptionInput {
  agentId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
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

function emitUpdate(agentId: string, snapshot: ProbeSnapshot | null): void {
  sessionProbeBus.emitUpdate({ agentId, snapshot });
}

function setFailedEntry(agentId: string, error: unknown): ProbeEntry {
  const entry: ProbeEntry = {
    agentId,
    status: "failed",
    acpSessionId: null,
    configOptions: [],
    availableCommands: [],
    error: normalizeError(error),
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(agentId, entry);
  emitUpdate(agentId, toProbeSnapshot(entry));
  return entry;
}

/**
 * Build the probe-only fallback handler for a given agent. It only reacts to
 * session-level metadata (available_commands_update); all message-stream events
 * (agent_message_chunk, tool_call, etc.) are ignored because the draft idle
 * window never carries them. On a command update it normalizes the commands,
 * patches the current registry entry, and broadcasts the new snapshot.
 */
function createProbeHandler(agentId: string): (notification: SessionNotification) => void {
  return (notification: SessionNotification): void => {
    if (notification.update.sessionUpdate !== "available_commands_update") {
      return;
    }
    const entry = sessionProbeRegistry.get(agentId);
    if (!entry) {
      return;
    }
    entry.availableCommands = normalizeAvailableCommands(notification.update);
    sessionProbeRegistry.set(agentId, entry);
    emitUpdate(agentId, toProbeSnapshot(entry));
  };
}

async function getConnection(agentId: string): Promise<ClientSideConnection> {
  try {
    const entry = await getOrStartProcess(agentId);
    return entry.connection;
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

export async function ensureProbe(agentId: string, projectPath: string): Promise<ProbeSnapshot> {
  const existing = sessionProbeRegistry.get(agentId);
  if (existing?.status === "ready") {
    return toProbeSnapshot(existing);
  }
  if (existing?.status === "starting" && existing.inflightEnsure) {
    return toProbeSnapshot(await existing.inflightEnsure);
  }

  const startingEntry: ProbeEntry = {
    agentId,
    status: "starting",
    acpSessionId: null,
    configOptions: [],
    availableCommands: [],
    startedAt: Date.now(),
  };
  sessionProbeRegistry.set(agentId, startingEntry);

  const inflightEnsure = (async (): Promise<ProbeEntry> => {
    try {
      const connection = await getConnection(agentId);
      const mcpServers = getBundledMcpServers({ projectPath }).map((spec) => ({
        ...spec,
        env: toAcpMcpServerEnv(spec.env),
      }));
      // Register the probe handler BEFORE newSession: claude-acp pushes
      // available_commands_update via setTimeout(0) right after newSession
      // returns, so the handler must already be in place to catch it.
      setPendingProbeHandler(agentId, createProbeHandler(agentId));
      const response = await connection.newSession({ cwd: projectPath, mcpServers });
      const current = sessionProbeRegistry.get(agentId);
      const readyEntry: ProbeEntry = {
        agentId,
        status: "ready",
        acpSessionId: response.sessionId,
        configOptions: normalizeAcpSessionConfigOptions(response.configOptions),
        // Carry whatever the probe handler has already accumulated. The commands
        // usually arrive asynchronously after newSession returns, so this is
        // often still [] here; the handler re-emits once they land.
        availableCommands: current?.availableCommands ?? [],
        startedAt: startingEntry.startedAt,
      };
      sessionProbeRegistry.set(agentId, readyEntry);
      emitUpdate(agentId, toProbeSnapshot(readyEntry));
      return readyEntry;
    } catch (error: unknown) {
      const failedEntry = setFailedEntry(agentId, error);
      throw ipcError(
        normalizeIpcErrorCode(failedEntry.error?.code),
        failedEntry.error?.message ?? "Failed to ensure probe"
      );
    }
  })();

  startingEntry.inflightEnsure = inflightEnsure;
  return toProbeSnapshot(await inflightEnsure);
}

export async function closeProbe(agentId: string): Promise<void> {
  const entry = sessionProbeRegistry.delete(agentId);
  // Always clear the probe fallback handler so it does not leak after close,
  // even when no ready session exists to close.
  clearPendingProbeHandler(agentId);
  emitUpdate(agentId, null);
  if (!entry || entry.status !== "ready" || entry.acpSessionId === null) {
    return;
  }

  try {
    const connection = await getConnection(agentId);
    await connection.closeSession({ sessionId: entry.acpSessionId });
  } catch (error: unknown) {
    logger.error(`[chat-probe] closeSession failed for agent=${agentId}`, error);
  }
}

export async function setProbeConfigOption(
  input: SetProbeConfigOptionInput
): Promise<ProbeSnapshot> {
  const entry = sessionProbeRegistry.get(input.agentId);
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
  emitUpdate(input.agentId, snapshot);
  return snapshot;
}

export function getProbeSnapshot(agentId: string): ProbeSnapshot | null {
  const entry = sessionProbeRegistry.get(agentId);
  return entry ? toProbeSnapshot(entry) : null;
}

onAgentUnavailable(({ agentId }) => {
  const removed = sessionProbeRegistry.delete(agentId);
  if (removed) {
    emitUpdate(agentId, null);
  }
});
