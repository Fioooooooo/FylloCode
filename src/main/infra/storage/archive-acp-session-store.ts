import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import {
  loadArchiveRunMeta,
  updateArchiveRunAcpSessionId,
} from "@main/infra/storage/apply-run-store";
import type { ProposalRef } from "@shared/types/proposal";

export class ArchiveAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly workspaceId: string,
    private readonly proposalRef: ProposalRef
  ) {}

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const meta = await loadArchiveRunMeta(this.workspaceId, this.proposalRef);
    return {
      acpSessionId: meta?.acpSessionId ?? null,
      configOptions: [],
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateArchiveRunAcpSessionId(this.workspaceId, this.proposalRef, acpSessionId);
  }
}
