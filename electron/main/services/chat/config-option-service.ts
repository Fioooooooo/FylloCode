import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import { loadSessionMeta, patchSessionMeta } from "@main/infra/storage/session-store";
import logger from "@main/infra/logger";
import { resolveProjectPath } from "./chat-service";
import { normalizeAcpSessionConfigOptions } from "./acp-mapper";
import { buildPayload, isMethodNotFoundError, valueExistsInSchema } from "./acp-config-option-rpc";

export interface SetConfigOptionParams {
  projectId: string;
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
  const { projectId, sessionId, configId, type, value } = params;

  const projectPath = await resolveProjectPath(projectId);
  const meta = await loadSessionMeta(projectPath, sessionId);
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

  const schema = meta.config_options?.find((option) => option.id === configId);
  if (schema) {
    if (schema.type !== type) {
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Config option ${configId} type mismatch: expected ${schema.type}, got ${type}`
      );
    }
    if (!valueExistsInSchema(schema, value)) {
      throw ipcError(
        IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE,
        `Value is not in the schema for config option ${configId}`
      );
    }
  }

  let connection: ClientSideConnection;
  try {
    const entry = await getOrStartProcess(meta.agentId);
    connection = entry.connection;
  } catch (error: unknown) {
    const e = error as Error & { code?: string };
    throw ipcError(
      e.code === IpcErrorCodes.ACP_NOT_READY
        ? IpcErrorCodes.ACP_NOT_READY
        : IpcErrorCodes.ACP_ERROR,
      e.message ?? "Failed to acquire ACP process"
    );
  }

  let response;
  try {
    response = await connection.setSessionConfigOption({
      sessionId: meta.acpSessionId,
      configId,
      ...buildPayload(type, value),
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

  const normalized = normalizeAcpSessionConfigOptions(response.configOptions);

  try {
    await patchSessionMeta(projectPath, sessionId, {
      config_options: normalized,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error("[chat] failed to persist config_options after setConfigOption", error);
  }

  return { configOptions: normalized };
}
