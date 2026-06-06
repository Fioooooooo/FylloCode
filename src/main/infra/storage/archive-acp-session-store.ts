import type { AcpSessionStore } from "@main/domain/chat/acp-session-store";
import {
  loadArchiveRunMeta,
  updateArchiveRunAcpSessionId,
} from "@main/infra/storage/apply-run-store";

export class ArchiveAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly projectPath: string,
    private readonly changeId: string
  ) {}

  async loadAcpSessionId(): Promise<string | null> {
    const meta = await loadArchiveRunMeta(this.projectPath, this.changeId);
    return meta?.acpSessionId ?? null;
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    await updateArchiveRunAcpSessionId(this.projectPath, this.changeId, acpSessionId);
  }
}
