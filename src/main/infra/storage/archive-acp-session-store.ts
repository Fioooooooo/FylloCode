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
    private readonly workspaceId: string,
    private readonly changeId: string
  ) {}

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const meta = await loadArchiveRunMeta(this.workspaceId, this.changeId);
    return {
      acpSessionId: meta?.acpSessionId ?? null,
      configOptions: [],
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateArchiveRunAcpSessionId(this.workspaceId, this.changeId, acpSessionId);
  }
}
