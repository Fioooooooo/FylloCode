import type { AcpSessionStore } from "@main/domain/chat/acp-session-store";
import { loadSessionMeta, upsertSessionMeta } from "@main/infra/storage/session-store";

const DEFAULT_TOKEN_USAGE = { used: 0, size: 0 };

export class ChatAcpSessionStore implements AcpSessionStore {
  constructor(
    private readonly projectPath: string,
    private readonly sessionId: string,
    private readonly agentId: string
  ) {}

  async loadAcpSessionId(): Promise<string | null> {
    const meta = await loadSessionMeta(this.projectPath, this.sessionId);
    return meta?.acpSessionId ?? null;
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    const meta = await loadSessionMeta(this.projectPath, this.sessionId);
    const now = new Date().toISOString();
    const nextTurnCount = (meta?.turnCount ?? 0) + 1;

    await upsertSessionMeta(
      this.projectPath,
      this.sessionId,
      () => ({
        sessionId: this.sessionId,
        acpSessionId,
        agentId: this.agentId,
        title: meta?.title ?? "New Session",
        turnCount: nextTurnCount,
        tokenUsage: meta?.tokenUsage ?? DEFAULT_TOKEN_USAGE,
        available_commands: meta?.available_commands,
        createdAt: meta?.createdAt ?? now,
        updatedAt: now,
      }),
      {
        acpSessionId,
        agentId: this.agentId,
        turnCount: nextTurnCount,
        updatedAt: now,
      }
    );
  }
}
