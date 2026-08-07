import type { ClientSideConnection, SessionConfigOption } from "@agentclientprotocol/sdk";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import {
  planSessionConfigRecovery,
  sessionConfigFingerprint,
  valueExistsInSchema,
} from "@main/domain/session/chat/session-config-recovery";
import logger from "@main/infra/logger";
import { normalizeAcpSessionConfigOptions } from "./acp-mapper";
import { buildPayload } from "./acp-config-option-rpc";

export interface ConfigOverrideWarning {
  optionId: string;
  message: string;
}

export interface RecoverSessionConfigParams {
  connection: ClientSideConnection;
  sessionId: string;
  persistedOptions: AcpSessionConfigOption[];
  liveOptions: SessionConfigOption[] | null | undefined;
}

function logIncompatibilities(
  sessionId: string,
  incompatibilities: ReturnType<typeof planSessionConfigRecovery>["incompatibilities"]
): void {
  for (const incompatibility of incompatibilities) {
    logger.warn("[chat.config-recovery] incompatible persisted option", {
      sessionId,
      configId: incompatibility.configId,
      reason: incompatibility.reason,
    });
  }
}

export async function recoverSessionConfig({
  connection,
  sessionId,
  persistedOptions,
  liveOptions,
}: RecoverSessionConfigParams): Promise<AcpSessionConfigOption[]> {
  if (persistedOptions.length === 0) {
    return normalizeAcpSessionConfigOptions(liveOptions);
  }

  let live =
    liveOptions === null || liveOptions === undefined
      ? null
      : normalizeAcpSessionConfigOptions(liveOptions);
  const seenFingerprints = new Set<string>();
  if (live !== null) {
    seenFingerprints.add(sessionConfigFingerprint(live));
  }
  const maxIterations = Math.max(1, persistedOptions.length * 3);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const plan = planSessionConfigRecovery(persistedOptions, live);
    if (plan.candidates.length === 0) {
      logIncompatibilities(sessionId, plan.incompatibilities);
      return live ?? [];
    }

    const candidate = plan.candidates[0];
    const response = await connection.setSessionConfigOption({
      sessionId,
      configId: candidate.configId,
      ...buildPayload(candidate.type, candidate.value),
    } as Parameters<ClientSideConnection["setSessionConfigOption"]>[0]);
    if (!Array.isArray(response.configOptions)) {
      throw new Error(
        `ACP config recovery for ${sessionId} did not return a complete configOptions snapshot`
      );
    }

    live = normalizeAcpSessionConfigOptions(response.configOptions);
    const fingerprint = sessionConfigFingerprint(live);
    const nextPlan = planSessionConfigRecovery(persistedOptions, live);
    if (nextPlan.candidates.length > 0 && seenFingerprints.has(fingerprint)) {
      throw new Error(`ACP config recovery for ${sessionId} did not converge`);
    }
    seenFingerprints.add(fingerprint);
  }

  throw new Error(`ACP config recovery for ${sessionId} exceeded ${maxIterations} iterations`);
}

export async function applySessionConfigOverrides(input: {
  connection: ClientSideConnection;
  sessionId: string;
  liveOptions: AcpSessionConfigOption[];
  overrides: Record<string, string | boolean>;
}): Promise<{ options: AcpSessionConfigOption[]; warnings: ConfigOverrideWarning[] }> {
  let options = input.liveOptions;
  const warnings: ConfigOverrideWarning[] = [];
  for (const [optionId, value] of Object.entries(input.overrides)) {
    const schema = options.find((option) => option.id === optionId);
    if (!schema) {
      throw Object.assign(new Error(`Unknown config option: ${optionId}`), {
        code: "SPAWN_INVALID_REQUEST",
      });
    }
    if (!valueExistsInSchema(schema, value)) {
      throw Object.assign(new Error(`Invalid value for config option: ${optionId}`), {
        code: "SPAWN_INVALID_REQUEST",
      });
    }
    try {
      const response = await input.connection.setSessionConfigOption({
        sessionId: input.sessionId,
        configId: optionId,
        ...buildPayload(schema.type, value),
      } as Parameters<ClientSideConnection["setSessionConfigOption"]>[0]);
      if (!Array.isArray(response.configOptions)) {
        throw new Error("Agent did not return a complete configOptions snapshot");
      }
      options = normalizeAcpSessionConfigOptions(response.configOptions);
    } catch (error) {
      warnings.push({
        optionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { options, warnings };
}
