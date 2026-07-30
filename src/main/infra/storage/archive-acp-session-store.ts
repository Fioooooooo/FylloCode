import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import {
  loadArchiveRunMeta,
  updateArchiveRunAcpSessionId,
} from "@main/infra/storage/apply-run-store";

export class ArchiveAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly projectPath: string,
    private readonly changeId: string
  ) {}

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const meta = await loadArchiveRunMeta(this.projectPath, this.changeId);
    return {
      acpSessionId: meta?.acpSessionId ?? null,
      configOptions: [],
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateArchiveRunAcpSessionId(this.projectPath, this.changeId, acpSessionId);
  }
}
