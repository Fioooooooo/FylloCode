import type { AcpSession } from "@main/services/session/chat/acp-session";
import logger from "@main/infra/logger";

/**
 * Categories of in-flight ACP sessions. Each owner has its own key space
 * so that chat `sessionId`, apply `runId`, and archive `workspaceId:changeId`
 * cannot collide.
 */
export type SessionOwner = "chat" | "apply" | "archive";

interface OwnedSession {
  owner: SessionOwner;
  key: string;
  session: AcpSession;
}

const byOwnerKey = new Map<string, OwnedSession>();
let shuttingDown = false;

function compositeKey(owner: SessionOwner, key: string): string {
  return `${owner}::${key}`;
}

export const sessionRegistry = {
  register(owner: SessionOwner, key: string, session: AcpSession): void {
    if (shuttingDown) {
      session.cancel();
      return;
    }
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

  cancelWorkspace(workspaceId: string): void {
    // archive owner 的 key 形如 "workspaceId:changeId"，按 workspaceId 前缀批量取消。
    const keyPrefix = `${workspaceId}:`;

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

  listWorkspace(workspaceId: string): Array<{ owner: SessionOwner; key: string }> {
    const keyPrefix = `${workspaceId}:`;
    return [...byOwnerKey.values()]
      .filter((entry) => entry.key.startsWith(keyPrefix))
      .map(({ owner, key }) => ({ owner, key }));
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

export function beginSessionRegistryShutdown(): void {
  shuttingDown = true;
}

export function disposeSessionRegistry(): void {
  beginSessionRegistryShutdown();
  sessionRegistry.cancelAll();
}

export function forceDisposeSessionRegistry(): void {
  disposeSessionRegistry();
}

export function resetSessionRegistryForTests(): void {
  sessionRegistry.cancelAll();
  shuttingDown = false;
}
