import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import {
  forgetActiveAcpSession,
  getOrStartProcess,
  hasActiveAcpSession,
} from "@main/infra/process/acp-process-pool";
import { loadSessionMeta, patchSessionMeta } from "@main/infra/storage/session-store";
import { resolveBundledMcpServers, toAcpMcpServer } from "@main/infra/mcp/bundled-mcp-servers";
import logger from "@main/infra/logger";
import { resolveWorkspaceCwd } from "./chat-service";
import { normalizeAcpSessionConfigOptions } from "./acp-mapper";
import { valueExistsInSchema } from "@main/domain/session/chat/session-config-recovery";
import { buildPayload, isMethodNotFoundError } from "./acp-config-option-rpc";
import { activateAcpSession } from "./acp-session-activation";
import { recoverSessionConfig } from "./session-config-recovery-service";

export interface SetConfigOptionParams {
  workspaceId: string;
  sessionId: string;
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
}

export interface SetConfigOptionResult {
  configOptions: AcpSessionConfigOption[];
}

export async function setConfigOption(
  params: SetConfigOptionParams
): Promise<SetConfigOptionResult> {
  const { workspaceId, sessionId, configId, type, value } = params;

  const workspaceCwd = await resolveWorkspaceCwd(workspaceId);
  const meta = await loadSessionMeta(workspaceId, sessionId);
  if (!meta) {
    throw ipcError(
      IpcErrorCodes.VALIDATION_ERROR,
      `Session not found or has no acpSessionId: ${sessionId}`
    );
  }
  if (!meta.acpSessionId) {
    throw ipcError(
      IpcErrorCodes.VALIDATION_ERROR,
      `Session ${sessionId} has no acpSessionId; cannot set config option`
    );
  }

  let entry: Awaited<ReturnType<typeof getOrStartProcess>>;
  try {
    entry = await getOrStartProcess(meta.agentId);
  } catch (error: unknown) {
    const e = error as Error & { code?: string };
    throw ipcError(
      e.code === IpcErrorCodes.ACP_NOT_READY
        ? IpcErrorCodes.ACP_NOT_READY
        : IpcErrorCodes.ACP_ERROR,
      e.message ?? "Failed to acquire ACP process"
    );
  }

  let liveOptions = meta.configOptions ?? [];
  const wasCold = !hasActiveAcpSession(entry, meta.acpSessionId);
  if (wasCold) {
    try {
      const supportsHttp =
        entry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;
      const mcpServers = (
        await resolveBundledMcpServers({
          workspaceId,
          projectPath: workspaceCwd,
          fylloSessionId: sessionId,
          supportsHttp,
        })
      ).map(toAcpMcpServer);
      const activation = await activateAcpSession({
        entry,
        initializeResponse: entry.initializeResponse,
        persistedSessionId: meta.acpSessionId,
        cwd: workspaceCwd,
        mcpServers,
        allowFreshSession: false,
      });
      liveOptions = await recoverSessionConfig({
        connection: entry.connection,
        sessionId: activation.sessionId,
        persistedOptions: meta.configOptions ?? [],
        liveOptions: activation.configOptions,
      });
    } catch (error: unknown) {
      forgetActiveAcpSession(entry, meta.acpSessionId);
      if (isMethodNotFoundError(error)) {
        throw ipcError(
          IpcErrorCodes.CONFIG_OPTION_NOT_SUPPORTED,
          "Agent does not implement session/set_config_option"
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw ipcError(IpcErrorCodes.ACP_ERROR, message);
    }
  }

  const schema = liveOptions.find((option) => option.id === configId);
  if (schema) {
    if (schema.type !== type) {
      if (wasCold) {
        forgetActiveAcpSession(entry, meta.acpSessionId);
      }
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Config option ${configId} type mismatch: expected ${schema.type}, got ${type}`
      );
    }
    if (!valueExistsInSchema(schema, value)) {
      if (wasCold) {
        forgetActiveAcpSession(entry, meta.acpSessionId);
      }
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Value is not in the schema for config option ${configId}`
      );
    }
  }

  let response;
  try {
    response = await entry.connection.setSessionConfigOption({
      sessionId: meta.acpSessionId,
      configId,
      ...buildPayload(type, value),
    } as Parameters<typeof entry.connection.setSessionConfigOption>[0]);
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

  const normalized = normalizeAcpSessionConfigOptions(response.configOptions);

  try {
    await patchSessionMeta(workspaceId, sessionId, {
      configOptions: normalized,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error("[chat] failed to persist configOptions after setConfigOption", error);
  }

  return { configOptions: normalized };
}
