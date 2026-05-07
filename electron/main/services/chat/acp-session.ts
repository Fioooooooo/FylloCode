import { EventEmitter } from "events";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { loadSessionMeta, saveSessionMeta } from "@main/infra/storage/session-store";
import { mapSessionUpdate } from "./acp-mapper";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import type { SessionEvent } from "@main/domain/chat/session-events";
import logger from "@main/infra/logger";

export interface AcpSessionOpts {
  fylloSessionId: string;
  agentId: string;
  projectPath: string;
  cwd: string;
}

export class AcpSession extends EventEmitter {
  private acpSessionId: string | null = null;
  private cancelled = false;

  constructor(private readonly opts: AcpSessionOpts) {
    super();
  }

  async start(prompt: string): Promise<void> {
    const { fylloSessionId, agentId, projectPath, cwd } = this.opts;

    let entry: Awaited<ReturnType<typeof getOrStartProcess>>;
    try {
      entry = await getOrStartProcess(agentId);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      this.emit("event", {
        type: "error",
        code: e.code ?? "ACP_ERROR",
        message: e.message,
      } satisfies SessionEvent);
      return;
    }

    const { connection, sessionHandlers } = entry;

    // Load persisted acpSessionId
    const meta = await loadSessionMeta(projectPath, fylloSessionId);
    let acpSessionId = meta?.acpSessionId;

    if (acpSessionId) {
      try {
        await connection.resumeSession({ sessionId: acpSessionId, cwd });
      } catch {
        logger.warn(
          `[acp-session] resumeSession failed for ${acpSessionId}, falling back to newSession`
        );
        acpSessionId = undefined;
      }
    }

    if (!acpSessionId) {
      const res = await connection.newSession({ cwd, mcpServers: [] });
      acpSessionId = res.sessionId;
    }

    this.acpSessionId = acpSessionId;

    // Persist immediately
    await saveSessionMeta(projectPath, {
      sessionId: fylloSessionId,
      acpSessionId,
      agentId,
      title: meta?.title ?? "New Session",
      turnCount: (meta?.turnCount ?? 0) + 1,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.emit("event", { type: "session_id_resolved", acpSessionId } satisfies SessionEvent);

    if (this.cancelled) return;

    // Register session update handler
    sessionHandlers.set(acpSessionId, (notification: SessionNotification) => {
      const event = mapSessionUpdate(notification.update);
      if (event) this.emit("event", event);
    });

    try {
      const result = await connection.prompt({
        sessionId: acpSessionId,
        prompt: [{ type: "text", text: prompt }],
      });

      const totalTokens =
        (result as unknown as { usage?: { outputTokens?: number } }).usage?.outputTokens ?? 0;
      this.emit("event", { type: "done", totalTokens } satisfies SessionEvent);
    } catch (err: unknown) {
      if (this.cancelled) return;
      const e = err as Error;
      this.emit("event", {
        type: "error",
        code: "ACP_ERROR",
        message: e.message,
      } satisfies SessionEvent);
    } finally {
      sessionHandlers.delete(acpSessionId);
    }
  }

  cancel(): void {
    this.cancelled = true;
    const { agentId } = this.opts;
    const acpSessionId = this.acpSessionId;
    if (!acpSessionId) return;

    getOrStartProcess(agentId)
      .then(({ connection }) => connection.cancel({ sessionId: acpSessionId }))
      .catch(() => {});
  }
}
