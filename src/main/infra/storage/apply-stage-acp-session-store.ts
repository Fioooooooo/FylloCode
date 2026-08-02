import logger from "@main/infra/logger";
import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import {
  loadApplyRunMeta,
  updateApplyRunStageAcpSessionId,
} from "@main/infra/storage/apply-run-store";

export class ApplyStageAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly workspaceId: string,
    private readonly changeId: string,
    private readonly runId: string,
    private readonly stageIndex: number
  ) {}

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const meta = await loadApplyRunMeta(this.workspaceId, this.changeId);
    if (!meta) {
      logger.warn(`[apply-stage-acp-session-store] run meta missing for change ${this.changeId}`);
      return { acpSessionId: null, configOptions: [] };
    }

    if (meta.runId !== this.runId) {
      logger.warn(
        `[apply-stage-acp-session-store] runId mismatch for change ${this.changeId}: expected ${this.runId}, got ${meta.runId}`
      );
      return { acpSessionId: null, configOptions: [] };
    }

    return {
      acpSessionId: meta.stageAcpSessionIds[this.stageIndex] ?? null,
      configOptions: [],
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateApplyRunStageAcpSessionId(
      this.workspaceId,
      this.changeId,
      this.runId,
      this.stageIndex,
      acpSessionId
    );
  }
}
