import {
  DEFAULT_CHAT_SESSION_MODE,
  type ChatSessionMode,
  type Message,
  type Session,
} from "@shared/types/chat";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { AcpAvailableCommand } from "@shared/types/chat";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { LineageTaskRef } from "@shared/types/lineage";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { resolveWorkspace } from "@main/services/workspace/_public";
import {
  createSessionWorkspaceSnapshot,
  validateSessionWorkspaceSnapshot,
} from "@main/domain/session/chat/session-workspace-snapshot";
import { assertSessionWorkspaceSnapshotCurrent } from "./session-workspace-service";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import {
  appendMessage,
  createSessionMeta,
  deleteSession as deleteSessionStore,
  listSessionMetas,
  loadMessages,
  loadSessionMeta,
  patchSessionMeta,
  type SessionMeta,
} from "@main/infra/storage/session-store";
import { newSessionId } from "@main/infra/ids";
import { ipcError } from "@main/ipc/_kit/errors";
import { normalizeAcpSessionConfigOptions } from "./acp-mapper";
import { deleteSpawnedSessionsForParent } from "../spawn/spawn-parent-lifecycle";

export async function assertSessionBelongsToWorkspace(
  workspaceId: string,
  sessionId: string
): Promise<void> {
  if (!(await loadSessionMeta(workspaceId, sessionId))) {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
      "Session does not belong to the sender Workspace",
      { workspaceId, sessionId }
    );
  }
}

// SessionMeta 只保存元数据，返回给 renderer 的 Session 默认 status 为 "ended"。
// 实际运行状态由当前是否关联活跃 AcpSession 决定，不在持久化层维护。
export function toSession(meta: SessionMeta, workspaceId: string): Session {
  return {
    id: meta.sessionId,
    workspaceId,
    agentId: meta.agentId,
    sessionMode: meta.sessionMode ?? DEFAULT_CHAT_SESSION_MODE,
    title: meta.title,
    isPinned: meta.isPinned === true,
    status: "ended",
    turnCount: meta.turnCount,
    tokenUsage: meta.tokenUsage,
    createdAt: new Date(meta.createdAt),
    updatedAt: new Date(meta.updatedAt),
    messages: [],
    availableCommands: meta.available_commands,
    configOptions: meta.configOptions,
    actionStates: meta.actionStates,
    originTaskRef: meta.originTaskRef,
    workspaceSnapshot: meta.workspaceSnapshot,
  };
}

export async function listSessions(workspaceId: string): Promise<Session[]> {
  const metas = await listSessionMetas(workspaceId);
  return metas
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map((meta) => toSession(meta, workspaceId));
}

// 创建会话元数据。允许调用方传入 fylloSessionId 以复用已有会话 id（如 probe 提升为 chat），
// 或传入 acpSessionId/taskRef 以在首次启动时跳过 session 恢复流程。
export async function createSession(input: {
  workspaceId: string;
  title: string;
  agentId: string;
  sessionMode?: ChatSessionMode;
  configOptions?: AcpSessionConfigOption[] | unknown[];
  availableCommands?: AcpAvailableCommand[];
  acpSessionId?: string;
  fylloSessionId?: string;
  taskRef?: LineageTaskRef;
  workspaceSnapshot?: SessionWorkspaceSnapshot;
}): Promise<Session> {
  const now = new Date();
  const workspaceSnapshot = input.workspaceSnapshot
    ? validateSessionWorkspaceSnapshot(input.workspaceSnapshot)
    : createSessionWorkspaceSnapshot(await resolveWorkspace(input.workspaceId));
  const meta: SessionMeta = {
    sessionId: input.fylloSessionId ? input.fylloSessionId : newSessionId(),
    agentId: input.agentId,
    sessionMode: input.sessionMode ?? DEFAULT_CHAT_SESSION_MODE,
    title: input.title,
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    workspaceSnapshot,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (input.acpSessionId) {
    meta.acpSessionId = input.acpSessionId;
  }
  if (input.taskRef) {
    meta.originTaskRef = input.taskRef;
  }
  if (input.configOptions !== undefined) {
    meta.configOptions = normalizeAcpSessionConfigOptions(
      input.configOptions as Parameters<typeof normalizeAcpSessionConfigOptions>[0]
    );
  }
  if (input.availableCommands !== undefined) {
    meta.available_commands = input.availableCommands;
  }
  await createSessionMeta(input.workspaceId, meta);
  return toSession(meta, input.workspaceId);
}

export async function ensureSessionWorkspaceSnapshot(
  workspaceId: string,
  sessionId: string
): Promise<SessionWorkspaceSnapshot> {
  const meta = await loadSessionMeta(workspaceId, sessionId);
  if (!meta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
  }

  if (meta.workspaceSnapshot) {
    return assertSessionWorkspaceSnapshotCurrent(meta.workspaceSnapshot);
  }

  const workspace = await resolveWorkspace(workspaceId);
  if (workspace.workspaceKind !== "folder") {
    throw ipcError(
      IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
      "This legacy Collection Workspace Session has no directory snapshot; create a new Session",
      { workspaceId, sessionId }
    );
  }

  const snapshot = createSessionWorkspaceSnapshot(workspace);
  const patched = await patchSessionMeta(workspaceId, sessionId, { workspaceSnapshot: snapshot });
  if (!patched) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
  }
  return assertSessionWorkspaceSnapshotCurrent(snapshot);
}

export async function updateSession(input: {
  id: string;
  workspaceId: string;
  patch: { title?: string; agentId?: string; isPinned?: boolean };
}): Promise<Session> {
  const meta = await loadSessionMeta(input.workspaceId, input.id);
  if (!meta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.id}`);
  }

  const updatesContentMetadata =
    input.patch.title !== undefined || input.patch.agentId !== undefined;
  const nextMeta = await patchSessionMeta(input.workspaceId, input.id, {
    ...input.patch,
    ...(updatesContentMetadata ? { updatedAt: new Date().toISOString() } : {}),
  });
  if (!nextMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.id}`);
  }
  return toSession(nextMeta, input.workspaceId);
}

export async function removeSession(input: { id: string; workspaceId: string }): Promise<void> {
  await deleteSpawnedSessionsForParent(input.workspaceId, input.id);
  await deleteSessionStore(input.workspaceId, input.id);
}

export async function loadSessionMessages(input: {
  sessionId: string;
  workspaceId: string;
}): Promise<UIMessage<MessageMeta>[]> {
  return loadMessages(input.workspaceId, input.sessionId);
}

export async function persistSessionMessage(input: {
  sessionId: string;
  workspaceId: string;
  message: Message;
}): Promise<void> {
  await appendMessage(input.workspaceId, input.sessionId, input.message);
}
