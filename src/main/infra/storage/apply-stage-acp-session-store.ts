import logger from "@main/infra/logger";
import type { AcpSessionStore } from "@main/domain/chat/acp-session-store";
import {
  loadApplyRunMeta,
  updateApplyRunStageAcpSessionId,
} from "@main/infra/storage/apply-run-store";

export class ApplyStageAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly projectPath: string,
    private readonly changeId: string,
    private readonly runId: string,
    private readonly stageIndex: number
  ) {}

  async loadAcpSessionId(): Promise<string | null> {
    const meta = await loadApplyRunMeta(this.projectPath, this.changeId);
    if (!meta) {
      logger.warn(`[apply-stage-acp-session-store] run meta missing for change ${this.changeId}`);
      return null;
    }

    if (meta.runId !== this.runId) {
      logger.warn(
        `[apply-stage-acp-session-store] runId mismatch for change ${this.changeId}: expected ${this.runId}, got ${meta.runId}`
      );
      return null;
    }

    return meta.stageAcpSessionIds[this.stageIndex] ?? null;
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateApplyRunStageAcpSessionId(
      this.projectPath,
      this.changeId,
      this.runId,
      this.stageIndex,
      acpSessionId
    );
  }
}
