import type { AcpSession } from "@main/services/session/chat/acp-session";
import logger from "@main/infra/logger";
import { chatTurnGate } from "@main/services/session/chat/chat-turn-gate";

/**
 * Categories of in-flight ACP sessions. Each owner has its own key space
 * so that chat `sessionId`, apply `runId`, and archive `workspaceId:changeId`
 * cannot collide.
 */
export type SessionOwner = "chat" | "apply" | "archive" | "spawn";
export type SessionRuntimeScope = "window" | "app";

interface OwnedSession {
  owner: SessionOwner;
  key: string;
  session: AcpSession;
  runtimeScope: SessionRuntimeScope;
}

const byOwnerKey = new Map<string, OwnedSession>();
let shuttingDown = false;

function compositeKey(owner: SessionOwner, key: string): string {
  return `${owner}::${key}`;
}

export function spawnSessionRegistryKey(
  workspaceId: string,
  parentSessionId: string,
  spawnedSessionId: string
): string {
  return `${workspaceId}:${parentSessionId}:${spawnedSessionId}`;
}

function spawnParentKeyPrefix(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}:${parentSessionId}:`;
}

export const sessionRegistry = {
  register(
    owner: SessionOwner,
    key: string,
    session: AcpSession,
    runtimeScope: SessionRuntimeScope = owner === "spawn" ? "app" : "window"
  ): void {
    if (shuttingDown) {
      session.cancel();
      return;
    }
    const composite = compositeKey(owner, key);
    if (byOwnerKey.has(composite)) {
      throw Object.assign(new Error(`Session already registered: ${owner}:${key}`), {
        code: "SESSION_ALREADY_ACTIVE",
      });
    }
    byOwnerKey.set(composite, { owner, key, session, runtimeScope });
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

  cancelSpawnedByParent(workspaceId: string, parentSessionId: string): void {
    const keyPrefix = spawnParentKeyPrefix(workspaceId, parentSessionId);
    for (const [key, entry] of byOwnerKey) {
      if (entry.owner !== "spawn" || !entry.key.startsWith(keyPrefix)) continue;
      try {
        entry.session.cancel();
      } catch (error) {
        logger.warn(`[session-registry] cancel ${key} failed`, error);
      }
      byOwnerKey.delete(key);
    }
  },

  listSpawnedByParent(workspaceId: string, parentSessionId: string): string[] {
    const keyPrefix = spawnParentKeyPrefix(workspaceId, parentSessionId);
    return [...byOwnerKey.values()]
      .filter((entry) => entry.owner === "spawn" && entry.key.startsWith(keyPrefix))
      .map((entry) => entry.key.slice(keyPrefix.length));
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

  cancelWindowOwnedWorkspace(workspaceId: string): void {
    const keyPrefix = `${workspaceId}:`;
    for (const [key, entry] of byOwnerKey) {
      if (!entry.key.startsWith(keyPrefix) || entry.runtimeScope !== "window") continue;
      try {
        entry.session.cancel();
      } catch (error) {
        logger.warn(`[session-registry] cancel ${key} failed`, error);
      }
      byOwnerKey.delete(key);
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
  chatTurnGate.clear();
}

export function forceDisposeSessionRegistry(): void {
  disposeSessionRegistry();
}

export function resetSessionRegistryForTests(): void {
  sessionRegistry.cancelAll();
  chatTurnGate.clear();
  shuttingDown = false;
}
