import type { AcpSession } from "@main/services/session/chat/acp-session";
import { registerDisposable } from "@main/bootstrap/lifecycle";
import logger from "@main/infra/logger";

/**
 * Categories of in-flight ACP sessions. Each owner has its own key space
 * so that chat `sessionId`, apply `runId`, and archive `projectId:changeId`
 * cannot collide.
 */
export type SessionOwner = "chat" | "apply" | "archive";

interface OwnedSession {
  owner: SessionOwner;
  key: string;
  session: AcpSession;
}

const byOwnerKey = new Map<string, OwnedSession>();

function compositeKey(owner: SessionOwner, key: string): string {
  return `${owner}::${key}`;
}

export const sessionRegistry = {
  register(owner: SessionOwner, key: string, session: AcpSession): void {
    byOwnerKey.set(compositeKey(owner, key), { owner, key, session });
  },

  get(owner: SessionOwner, key: string): AcpSession | undefined {
    return byOwnerKey.get(compositeKey(owner, key))?.session;
  },

  unregister(owner: SessionOwner, key: string): void {
    byOwnerKey.delete(compositeKey(owner, key));
  },

  cancel(owner: SessionOwner, key: string): void {
    const entry = byOwnerKey.get(compositeKey(owner, key));
    if (!entry) return;
    entry.session.cancel();
    byOwnerKey.delete(compositeKey(owner, key));
  },

  cancelByOwner(owner: SessionOwner): void {
    for (const [k, entry] of byOwnerKey) {
      if (entry.owner !== owner) continue;
      try {
        entry.session.cancel();
      } catch (err) {
        logger.warn(`[session-registry] cancel ${k} failed`, err);
      }
      byOwnerKey.delete(k);
    }
  },

  cancelProject(projectId: string): void {
    // archive owner 的 key 形如 "projectId:changeId"，按 projectId 前缀批量取消。
    const keyPrefix = `${projectId}:`;

    for (const [k, entry] of byOwnerKey) {
      if (!entry.key.startsWith(keyPrefix)) continue;
      try {
        entry.session.cancel();
      } catch (err) {
        logger.warn(`[session-registry] cancel ${k} failed`, err);
      }
      byOwnerKey.delete(k);
    }
  },

  cancelAll(): void {
    for (const [k, entry] of byOwnerKey) {
      try {
        entry.session.cancel();
      } catch (err) {
        logger.warn(`[session-registry] cancel ${k} failed`, err);
      }
    }
    byOwnerKey.clear();
  },

  size(): number {
    return byOwnerKey.size;
  },
};

registerDisposable({
  name: "session-registry",
  dispose: () => sessionRegistry.cancelAll(),
});
