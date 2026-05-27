import { promises as fs } from "fs";
import { join } from "path";
import { sessionsDir } from "@main/infra/storage/project-paths";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, MessageMeta, TokenUsage } from "@shared/types/chat";
import type { UIMessage } from "ai";

export interface SessionMeta {
  sessionId: string;
  acpSessionId?: string;
  agentId: string;
  title: string;
  turnCount: number;
  tokenUsage: TokenUsage;
  available_commands?: AcpAvailableCommand[];
  config_options?: AcpSessionConfigOption[];
  createdAt: string;
  updatedAt: string;
}

export type SessionMetaPatch = Partial<
  Omit<SessionMeta, "sessionId" | "createdAt" | "tokenUsage">
> & {
  tokenUsage?: Partial<TokenUsage>;
};

type SessionMetaRecord = Record<string, unknown>;

const DEFAULT_TOKEN_USAGE: Pick<TokenUsage, "used" | "size"> = { used: 0, size: 0 };
const sessionMetaWriteQueues = new Map<string, Promise<void>>();
let sessionMetaTempWriteCounter = 0;

function metaPath(projectPath: string, sessionId: string): string {
  return join(sessionsDir(projectPath), `${sessionId}.json`);
}

export function sessionMessagesPath(projectPath: string, sessionId: string): string {
  return join(sessionsDir(projectPath), `${sessionId}.messages.jsonl`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function isSessionMetaRecord(value: unknown): value is SessionMetaRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractLeadingJsonObject(content: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (start === -1) {
      if (/\s/.test(char)) {
        continue;
      }
      if (char !== "{") {
        return null;
      }
      start = index;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return content.slice(start, index + 1);
    }
  }

  return null;
}

function parseSessionMetaRecordContent(content: string): {
  record: SessionMetaRecord;
  repaired: boolean;
} | null {
  try {
    const parsed = JSON.parse(content);
    return isSessionMetaRecord(parsed) ? { record: parsed, repaired: false } : null;
  } catch (error: unknown) {
    if (!(error instanceof SyntaxError)) {
      return null;
    }
  }

  const recoveredContent = extractLeadingJsonObject(content);
  if (!recoveredContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(recoveredContent);
    return isSessionMetaRecord(parsed) ? { record: parsed, repaired: true } : null;
  } catch {
    return null;
  }
}

async function withSessionMetaWriteLock<T>(
  projectPath: string,
  sessionId: string,
  task: () => Promise<T>
): Promise<T> {
  const filePath = metaPath(projectPath, sessionId);
  const previous = sessionMetaWriteQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  sessionMetaWriteQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (sessionMetaWriteQueues.get(filePath) === queued) {
      sessionMetaWriteQueues.delete(filePath);
    }
  }
}

async function writeSessionMetaFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${sessionMetaTempWriteCounter}.tmp`;
  sessionMetaTempWriteCounter += 1;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function writeSessionMetaRecordUnlocked(
  projectPath: string,
  record: SessionMetaRecord
): Promise<SessionMetaRecord> {
  const normalized = normalizeSessionMetaRecord(record);
  const sessionId = normalized.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("session meta record must include a string sessionId");
  }

  await ensureDir(sessionsDir(projectPath));
  await writeSessionMetaFile(metaPath(projectPath, sessionId), JSON.stringify(normalized, null, 2));
  return normalized;
}

async function readSessionMetaRecord(
  projectPath: string,
  sessionId: string
): Promise<SessionMetaRecord | null> {
  try {
    const content = await fs.readFile(metaPath(projectPath, sessionId), "utf8");
    const parsed = parseSessionMetaRecordContent(content);
    if (!parsed) {
      return null;
    }

    return parsed.record;
  } catch {
    return null;
  }
}

function normalizeCost(cost: Partial<TokenUsage["cost"]> | null | undefined): TokenUsage["cost"] {
  if (typeof cost?.amount !== "number" || typeof cost.currency !== "string") {
    return undefined;
  }

  return {
    amount: cost.amount,
    currency: cost.currency,
  };
}

function normalizeTokenUsage(tokenUsage: Partial<TokenUsage> | null | undefined): TokenUsage {
  return {
    used: typeof tokenUsage?.used === "number" ? tokenUsage.used : DEFAULT_TOKEN_USAGE.used,
    size: typeof tokenUsage?.size === "number" ? tokenUsage.size : DEFAULT_TOKEN_USAGE.size,
    cost: normalizeCost(tokenUsage?.cost),
  };
}

function normalizeSessionMetaRecord(raw: SessionMetaRecord): SessionMetaRecord {
  return {
    ...raw,
    tokenUsage: normalizeTokenUsage(raw.tokenUsage as Partial<TokenUsage> | undefined),
    available_commands: Array.isArray(raw.available_commands) ? raw.available_commands : undefined,
    config_options: Array.isArray(raw.config_options) ? raw.config_options : undefined,
  };
}

function toSessionMeta(record: SessionMetaRecord): SessionMeta {
  return normalizeSessionMetaRecord(record) as unknown as SessionMeta;
}

async function writeSessionMetaRecord(
  projectPath: string,
  record: SessionMetaRecord
): Promise<SessionMetaRecord> {
  const sessionId = record.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("session meta record must include a string sessionId");
  }

  return withSessionMetaWriteLock(projectPath, sessionId, async () =>
    writeSessionMetaRecordUnlocked(projectPath, record)
  );
}

function mergeSessionMetaRecord(
  current: SessionMetaRecord,
  patch: SessionMetaPatch
): SessionMetaRecord {
  const nextTokenUsage =
    patch.tokenUsage === undefined
      ? current.tokenUsage
      : {
          ...(current.tokenUsage as Record<string, unknown> | undefined),
          ...patch.tokenUsage,
        };

  return {
    ...current,
    ...patch,
    sessionId: current.sessionId,
    createdAt: current.createdAt,
    tokenUsage: nextTokenUsage,
  };
}

export async function createSessionMeta(
  projectPath: string,
  meta: SessionMeta
): Promise<SessionMeta> {
  await writeSessionMetaRecord(projectPath, meta as unknown as SessionMetaRecord);
  return meta;
}

export async function saveSessionMeta(projectPath: string, meta: SessionMeta): Promise<void> {
  await writeSessionMetaRecord(projectPath, meta as unknown as SessionMetaRecord);
}

export async function loadSessionMeta(
  projectPath: string,
  sessionId: string
): Promise<SessionMeta | null> {
  const record = await readSessionMetaRecord(projectPath, sessionId);
  return record ? toSessionMeta(record) : null;
}

export async function listSessionMetas(projectPath: string): Promise<SessionMeta[]> {
  try {
    const dir = sessionsDir(projectPath);
    const files = await fs.readdir(dir);
    const metas: SessionMeta[] = [];
    for (const file of files) {
      if (!file.startsWith("session") || !file.endsWith(".json")) continue;
      try {
        const sessionId = file.slice(0, -".json".length);
        const meta = await loadSessionMeta(projectPath, sessionId);
        if (meta) {
          metas.push(meta);
        }
      } catch {
        // skip malformed files
      }
    }
    return metas;
  } catch {
    return [];
  }
}

export async function patchSessionMeta(
  projectPath: string,
  sessionId: string,
  patch: SessionMetaPatch | ((currentMeta: SessionMeta) => SessionMetaPatch)
): Promise<SessionMeta | null> {
  return withSessionMetaWriteLock(projectPath, sessionId, async () => {
    const currentRecord = await readSessionMetaRecord(projectPath, sessionId);
    if (!currentRecord) {
      return null;
    }

    const currentMeta = toSessionMeta(currentRecord);
    const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
    return toSessionMeta(
      await writeSessionMetaRecordUnlocked(
        projectPath,
        mergeSessionMetaRecord(currentRecord, nextPatch)
      )
    );
  });
}

export async function upsertSessionMeta(
  projectPath: string,
  sessionId: string,
  create: () => SessionMeta,
  patch: SessionMetaPatch | ((currentMeta: SessionMeta) => SessionMetaPatch)
): Promise<SessionMeta> {
  return withSessionMetaWriteLock(projectPath, sessionId, async () => {
    const currentRecord =
      (await readSessionMetaRecord(projectPath, sessionId)) ??
      (create() as unknown as SessionMetaRecord);
    const currentMeta = toSessionMeta(currentRecord);
    const nextPatch = typeof patch === "function" ? patch(currentMeta) : patch;
    return toSessionMeta(
      await writeSessionMetaRecordUnlocked(
        projectPath,
        mergeSessionMetaRecord(currentRecord, nextPatch)
      )
    );
  });
}

export async function deleteSession(projectPath: string, sessionId: string): Promise<void> {
  await Promise.allSettled([
    fs.unlink(metaPath(projectPath, sessionId)),
    fs.unlink(sessionMessagesPath(projectPath, sessionId)),
  ]);
}

export async function appendMessage(
  projectPath: string,
  sessionId: string,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(sessionsDir(projectPath));
  const line = JSON.stringify(message) + "\n";
  await fs.appendFile(sessionMessagesPath(projectPath, sessionId), line, "utf8");
}

export async function loadMessages(
  projectPath: string,
  sessionId: string
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(sessionMessagesPath(projectPath, sessionId), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  } catch {
    return [];
  }
}
