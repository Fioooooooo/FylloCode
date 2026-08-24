import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import {
  loadSpawnedSessionMeta,
  patchSpawnedSessionMeta,
} from "@main/infra/storage/spawned-session-store";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";

export interface SpawnedSessionStoreOwner {
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
}

export class SpawnedAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly owner: SpawnedSessionStoreOwner,
    private readonly nowIso: () => string
  ) {}

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const meta = await loadSpawnedSessionMeta(this.owner);
    return {
      acpSessionId: meta?.acpSessionId ?? null,
      configOptions: structuredClone(meta?.configOptions ?? []),
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await patchSpawnedSessionMeta(this.owner, {
      acpSessionId,
      updatedAt: this.nowIso(),
    });
  }

  async persistPreparedSession(
    acpSessionId: string,
    configOptions: AcpSessionConfigOption[]
  ): Promise<void> {
    await patchSpawnedSessionMeta(this.owner, {
      acpSessionId,
      configOptions: structuredClone(configOptions),
      updatedAt: this.nowIso(),
    });
  }
}
