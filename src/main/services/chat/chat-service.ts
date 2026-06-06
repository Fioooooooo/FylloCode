import type { Message, Session } from "@shared/types/chat";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { AcpAvailableCommand } from "@shared/types/chat";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { loadProject } from "@main/infra/storage/project-store";
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

export async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return project.path;
}

export function toSession(meta: SessionMeta, projectId: string): Session {
  return {
    id: meta.sessionId,
    projectId,
    agentId: meta.agentId,
    title: meta.title,
    status: "ended",
    turnCount: meta.turnCount,
    tokenUsage: meta.tokenUsage,
    createdAt: new Date(meta.createdAt),
    updatedAt: new Date(meta.updatedAt),
    messages: [],
    availableCommands: meta.available_commands,
    configOptions: meta.configOptions,
  };
}

export async function listSessions(projectId: string): Promise<Session[]> {
  const projectPath = await resolveProjectPath(projectId);
  const metas = await listSessionMetas(projectPath);
  return metas
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map((meta) => toSession(meta, projectId));
}

export async function createSession(input: {
  projectId: string;
  title: string;
  agentId: string;
  configOptions?: AcpSessionConfigOption[] | unknown[];
  availableCommands?: AcpAvailableCommand[];
  acpSessionId?: string;
}): Promise<Session> {
  const projectPath = await resolveProjectPath(input.projectId);
  const now = new Date();
  const meta: SessionMeta = {
    sessionId: newSessionId(),
    agentId: input.agentId,
    title: input.title,
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (input.acpSessionId) {
    meta.acpSessionId = input.acpSessionId;
  }
  if (input.configOptions !== undefined) {
    meta.configOptions = normalizeAcpSessionConfigOptions(
      input.configOptions as Parameters<typeof normalizeAcpSessionConfigOptions>[0]
    );
  }
  if (input.availableCommands !== undefined) {
    meta.available_commands = input.availableCommands;
  }
  await createSessionMeta(projectPath, meta);
  return toSession(meta, input.projectId);
}

export async function updateSession(input: {
  id: string;
  projectId: string;
  patch: { title?: string; agentId?: string };
}): Promise<Session> {
  const projectPath = await resolveProjectPath(input.projectId);
  const meta = await loadSessionMeta(projectPath, input.id);
  if (!meta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.id}`);
  }

  const nextMeta = await patchSessionMeta(projectPath, input.id, {
    title: input.patch.title ?? meta.title,
    agentId: input.patch.agentId ?? meta.agentId,
    updatedAt: new Date().toISOString(),
  });
  if (!nextMeta) {
    throw ipcError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.id}`);
  }
  return toSession(nextMeta, input.projectId);
}

export async function removeSession(input: { id: string; projectId: string }): Promise<void> {
  const projectPath = await resolveProjectPath(input.projectId);
  await deleteSessionStore(projectPath, input.id);
}

export async function loadSessionMessages(input: {
  sessionId: string;
  projectId: string;
}): Promise<UIMessage<MessageMeta>[]> {
  const projectPath = await resolveProjectPath(input.projectId);
  return loadMessages(projectPath, input.sessionId);
}

export async function persistSessionMessage(input: {
  sessionId: string;
  projectId: string;
  message: Message;
}): Promise<void> {
  const projectPath = await resolveProjectPath(input.projectId);
  await appendMessage(projectPath, input.sessionId, input.message);
}
