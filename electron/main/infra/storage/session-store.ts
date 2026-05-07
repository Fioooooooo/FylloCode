import { promises as fs } from "fs";
import { join } from "path";
import { sessionsDir } from "@main/infra/storage/project-paths";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export interface SessionMeta {
  sessionId: string;
  acpSessionId?: string;
  agentId: string;
  title: string;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

function metaPath(projectPath: string, sessionId: string): string {
  return join(sessionsDir(projectPath), `${sessionId}.json`);
}

function messagesPath(projectPath: string, sessionId: string): string {
  return join(sessionsDir(projectPath), `${sessionId}.messages.jsonl`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveSessionMeta(projectPath: string, meta: SessionMeta): Promise<void> {
  await ensureDir(sessionsDir(projectPath));
  await fs.writeFile(metaPath(projectPath, meta.sessionId), JSON.stringify(meta, null, 2), "utf8");
}

export async function loadSessionMeta(
  projectPath: string,
  sessionId: string
): Promise<SessionMeta | null> {
  try {
    const content = await fs.readFile(metaPath(projectPath, sessionId), "utf8");
    return JSON.parse(content) as SessionMeta;
  } catch {
    return null;
  }
}

export async function listSessionMetas(projectPath: string): Promise<SessionMeta[]> {
  try {
    const dir = sessionsDir(projectPath);
    const files = await fs.readdir(dir);
    const metas: SessionMeta[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(join(dir, file), "utf8");
        metas.push(JSON.parse(content) as SessionMeta);
      } catch {
        // skip malformed files
      }
    }
    return metas;
  } catch {
    return [];
  }
}

export async function deleteSession(projectPath: string, sessionId: string): Promise<void> {
  await Promise.allSettled([
    fs.unlink(metaPath(projectPath, sessionId)),
    fs.unlink(messagesPath(projectPath, sessionId)),
  ]);
}

export async function appendMessage(
  projectPath: string,
  sessionId: string,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(sessionsDir(projectPath));
  const line = JSON.stringify(message) + "\n";
  await fs.appendFile(messagesPath(projectPath, sessionId), line, "utf8");
}

export async function loadMessages(
  projectPath: string,
  sessionId: string
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(messagesPath(projectPath, sessionId), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  } catch {
    return [];
  }
}
