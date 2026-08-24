import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { hasActiveAcpSession, hasActiveMcpActivation } from "@main/infra/process/acp-process-pool";
import { activateAcpSession } from "@main/services/session/chat/acp-session-activation";
import { buildPayload } from "@main/services/session/chat/acp-config-option-rpc";
import { normalizeAcpSessionConfigOptions } from "@main/services/session/chat/acp-mapper";
import { recoverSessionConfig } from "@main/services/session/chat/session-config-recovery-service";
import { createSpawnRuntimeProfile } from "@main/services/session/chat/session-runtime-profile";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import type { SpawnConfigResolutionIssue } from "@shared/types/fyllo-spawn-rpc";
import {
  createSpawnConfigPlanningState,
  observeSpawnConfigSnapshot,
  planSpawnConfig,
  type SpawnConfigRequest,
} from "@main/domain/session/spawn/spawn-config-resolution";
import type { SpawnedAcpSessionStore } from "./spawn-acp-session-store";

type AgentProcessEntry = Awaited<
  ReturnType<typeof import("@main/infra/process/acp-process-pool").getOrStartProcess>
>;

export interface SpawnConfigPreparationInput {
  entry: AgentProcessEntry;
  agentId: string;
  workspaceSnapshot: SessionWorkspaceSnapshot;
  sessionStore: SpawnedAcpSessionStore;
  request: SpawnConfigRequest;
}

export interface SpawnConfigReady {
  status: "ready";
  acpSessionId: string;
  configOptions: AcpSessionConfigOption[];
  warnings: [];
}

export interface SpawnConfigRequired {
  status: "configuration_required";
  acpSessionId: string;
  configOptions: AcpSessionConfigOption[];
  issues: SpawnConfigResolutionIssue[];
}

export type SpawnConfigPreparationResult = SpawnConfigReady | SpawnConfigRequired;

export class SpawnConfigPreparationError extends Error {
  constructor(
    public readonly code: "SPAWN_INVALID_REQUEST" | "SPAWN_CONFIG_FAILED",
    message: string
  ) {
    super(message);
    this.name = "SpawnConfigPreparationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function configFailed(message: string): SpawnConfigPreparationError {
  return new SpawnConfigPreparationError("SPAWN_CONFIG_FAILED", message);
}

function invalidRequest(message: string): SpawnConfigPreparationError {
  return new SpawnConfigPreparationError("SPAWN_INVALID_REQUEST", message);
}

async function activateSpawnSession(
  input: SpawnConfigPreparationInput,
  persistedSessionId: string | null,
  persistedOptions: AcpSessionConfigOption[]
) {
  if (
    persistedSessionId &&
    hasActiveAcpSession(input.entry, persistedSessionId) &&
    hasActiveMcpActivation(input.entry, persistedSessionId)
  ) {
    return {
      sessionId: persistedSessionId,
      configOptions: persistedOptions,
    };
  }

  const runtimeProfile = createSpawnRuntimeProfile();
  return activateAcpSession({
    entry: input.entry,
    initializeResponse: input.entry.initializeResponse,
    persistedSessionId,
    cwd: input.workspaceSnapshot.cwd,
    additionalDirectories: input.workspaceSnapshot.additionalDirectories,
    createMcpActivation: async () => runtimeProfile,
    allowFreshSession: true,
  });
}

async function setConfigOption(
  connection: ClientSideConnection,
  sessionId: string,
  action: { optionId: string; type: "select" | "boolean"; value: string | boolean }
): Promise<AcpSessionConfigOption[]> {
  let response: Awaited<ReturnType<ClientSideConnection["setSessionConfigOption"]>>;
  try {
    response = await connection.setSessionConfigOption({
      sessionId,
      configId: action.optionId,
      ...buildPayload(action.type, action.value),
    } as Parameters<ClientSideConnection["setSessionConfigOption"]>[0]);
  } catch (error) {
    throw configFailed(
      `ACP set_config_option failed for ${action.optionId}: ${errorMessage(error)}`
    );
  }
  if (!Array.isArray(response.configOptions)) {
    throw configFailed(
      `ACP set_config_option for ${action.optionId} did not return a complete configOptions snapshot`
    );
  }
  try {
    return normalizeAcpSessionConfigOptions(response.configOptions);
  } catch (error) {
    throw configFailed(
      `ACP set_config_option for ${action.optionId} returned an invalid configOptions snapshot: ${errorMessage(error)}`
    );
  }
}

/** 在正式 turn 持久化和 prompt dispatch 前收敛语义/raw desired state。 */
export async function prepareSpawnConfig(
  input: SpawnConfigPreparationInput
): Promise<SpawnConfigPreparationResult> {
  const recoveryState = await input.sessionStore.loadRecoveryState();
  const activation = await activateSpawnSession(
    input,
    recoveryState.acpSessionId,
    recoveryState.configOptions
  );
  const acpSessionId = activation.sessionId;
  let options: AcpSessionConfigOption[];

  try {
    options = await recoverSessionConfig({
      connection: input.entry.connection,
      sessionId: acpSessionId,
      persistedOptions: recoveryState.configOptions,
      liveOptions: activation.configOptions,
    });
  } catch (error) {
    throw configFailed(`ACP config recovery failed: ${errorMessage(error)}`);
  }

  await input.sessionStore.persistPreparedSession(acpSessionId, options);
  let planningState = createSpawnConfigPlanningState(input.request);

  for (;;) {
    const observation = observeSpawnConfigSnapshot(planningState, options);
    if (observation.status === "repeated") {
      throw configFailed(
        "ACP semantic config planning repeated a live snapshot without converging"
      );
    }
    if (observation.status === "limit_exceeded") {
      throw configFailed("ACP semantic config planning exceeded its finite iteration limit");
    }
    planningState = observation.state;

    const plan = planSpawnConfig(options, input.request);
    if (plan.status === "ready") {
      return { status: "ready", acpSessionId, configOptions: options, warnings: [] };
    }
    if (plan.status === "configuration_required") {
      return {
        status: "configuration_required",
        acpSessionId,
        configOptions: options,
        issues: [plan.issue],
      };
    }
    if (plan.status === "invalid") {
      throw invalidRequest(plan.message);
    }

    options = await setConfigOption(input.entry.connection, acpSessionId, plan.action);
    await input.sessionStore.persistPreparedSession(acpSessionId, options);
  }
}
