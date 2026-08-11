import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import type { UIMessage } from "ai";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import { parseJsonlLines } from "@main/infra/storage/jsonl";
import {
  spawnedSessionMessagesPath,
  spawnedSessionMetaPath,
  spawnedSessionResponsePath,
  spawnedSessionResponsesDir,
  spawnedSessionTurnPath,
  spawnedSessionTurnsDir,
  spawnedSessionsDir,
  sessionsDir,
} from "@main/infra/storage/workspace-paths";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { MessageMeta, TokenUsage } from "@shared/types/chat";
import { appendMessageJsonl, patchMessageJsonlMetadata } from "./message-jsonl-store";
import {
  DEFAULT_RESPONSE_CHUNK_BYTES,
  MAX_INLINE_RESPONSE_BYTES,
  MAX_RESPONSE_CHUNK_BYTES,
  spawnConfigOptionSummarySchema,
  spawnRecentActivitySchema,
  spawnTurnModeSchema,
  spawnWarningSchema,
  type ReadResponseResult,
  type SpawnConfigOptionSummary,
  type SpawnRecentActivity,
  type SpawnTurnMode,
  type SpawnWarning,
} from "@shared/types/fyllo-spawn-rpc";
import {
  sessionWorkspaceSnapshotSchema,
  type SessionWorkspaceSnapshot,
} from "@shared/types/workspace";

const spawnedSessionStatusSchema = z.enum(["idle", "running", "error", "expired"]);
const storedMetaSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().min(1),
    parentSessionId: z.string().min(1),
    sessionId: z.string().min(1),
    agentId: z.string().min(1),
    acpSessionId: z.string().min(1).optional(),
    processGeneration: z.number().int().nonnegative().optional(),
    workspaceSnapshot: sessionWorkspaceSnapshotSchema,
    status: spawnedSessionStatusSchema,
    configOptions: z.array(z.unknown()),
    turnCount: z.number().int().nonnegative(),
    tokenUsage: z.object({
      used: z.number().finite().nonnegative(),
      size: z.number().finite().nonnegative(),
      cost: z.object({ amount: z.number().finite(), currency: z.string().min(1) }).optional(),
    }),
    latestResponseId: z.string().min(1).optional(),
    error: z.object({ code: z.string().min(1), message: z.string().min(1) }).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export interface SpawnedSessionMeta {
  version: 1;
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
  agentId: string;
  acpSessionId?: string;
  processGeneration?: number;
  workspaceSnapshot: SessionWorkspaceSnapshot;
  status: z.infer<typeof spawnedSessionStatusSchema>;
  configOptions: AcpSessionConfigOption[];
  turnCount: number;
  tokenUsage: TokenUsage;
  latestResponseId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

export interface SpawnedStoreOwner {
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
}

export interface SpawnedSessionStoredView {
  meta: SpawnedSessionMeta;
  turns: SpawnedTurnRecord[];
  messages: Array<UIMessage<MessageMeta>>;
}

export const spawnedTurnPhaseSchema = z.enum([
  "starting",
  "running",
  "cancelling",
  "completed",
  "error",
  "expired",
  "interrupted",
]);

export const spawnNotificationStateSchema = z.enum([
  "pending",
  "dispatched",
  "delivered",
  "delivery_unknown",
  "suppressed",
]);

const spawnNotificationSchema = z
  .object({
    notificationId: z.string().min(1).max(256),
    state: spawnNotificationStateSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();

const spawnedTurnRecordSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().min(1),
    parentSessionId: z.string().min(1),
    sessionId: z.string().min(1),
    turnId: z.string().min(1),
    agentId: z.string().min(1),
    mode: spawnTurnModeSchema,
    phase: spawnedTurnPhaseSchema,
    startedAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    recentActivity: z.array(spawnRecentActivitySchema).max(3),
    config: z.array(spawnConfigOptionSummarySchema),
    warnings: z.array(spawnWarningSchema),
    responseId: z.string().min(1).optional(),
    error: z
      .object({ code: z.string().min(1), message: z.string().min(1) })
      .strict()
      .optional(),
    notification: spawnNotificationSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type SpawnedTurnPhase = z.infer<typeof spawnedTurnPhaseSchema>;
export type SpawnNotificationState = z.infer<typeof spawnNotificationStateSchema>;

export interface SpawnedTurnRecord {
  version: 1;
  workspaceId: string;
  parentSessionId: string;
  sessionId: string;
  turnId: string;
  agentId: string;
  mode: SpawnTurnMode;
  phase: SpawnedTurnPhase;
  startedAt: string;
  lastActivityAt: string;
  recentActivity: SpawnRecentActivity[];
  config: SpawnConfigOptionSummary[];
  warnings: SpawnWarning[];
  responseId?: string;
  error?: { code: string; message: string };
  notification?: {
    notificationId: string;
    state: SpawnNotificationState;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

const writeQueues = new Map<string, Promise<void>>();
const fencedParents = new Set<string>();
let shuttingDown = false;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function parentKey(workspaceId: string, parentSessionId: string): string {
  return `${workspaceId}\0${parentSessionId}`;
}

function ownerKey(owner: SpawnedStoreOwner): string {
  return `${owner.workspaceId}\0${owner.parentSessionId}\0${owner.sessionId}`;
}

function assertWritable(owner: Pick<SpawnedStoreOwner, "workspaceId" | "parentSessionId">): void {
  if (shuttingDown || fencedParents.has(parentKey(owner.workspaceId, owner.parentSessionId))) {
    throw Object.assign(new Error("Spawned Session storage is fenced"), {
      code: "SPAWN_STORAGE_FENCED",
    });
  }
}

async function withWriteQueue<T>(owner: SpawnedStoreOwner, task: () => Promise<T>): Promise<T> {
  const key = ownerKey(owner);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  writeQueues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    assertWritable(owner);
    return await task();
  } finally {
    release();
    if (writeQueues.get(key) === queued) writeQueues.delete(key);
  }
}

function parseMeta(input: unknown): SpawnedSessionMeta {
  return storedMetaSchema.parse(input) as SpawnedSessionMeta;
}

function parseTurnRecord(input: unknown): SpawnedTurnRecord {
  return spawnedTurnRecordSchema.parse(input) as SpawnedTurnRecord;
}

function assertTurnOwner(record: SpawnedTurnRecord, owner: SpawnedStoreOwner): void {
  if (
    record.workspaceId !== owner.workspaceId ||
    record.parentSessionId !== owner.parentSessionId ||
    record.sessionId !== owner.sessionId
  ) {
    throw Object.assign(new Error("Spawned turn owner does not match its storage path"), {
      code: "SPAWN_INVALID_REQUEST",
    });
  }
}

export async function loadSpawnedSessionMeta(
  owner: SpawnedStoreOwner
): Promise<SpawnedSessionMeta | null> {
  try {
    return parseMeta(
      JSON.parse(
        await fs.readFile(
          spawnedSessionMetaPath(owner.workspaceId, owner.parentSessionId, owner.sessionId),
          "utf8"
        )
      ) as unknown
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeSpawnedSessionMeta(meta: SpawnedSessionMeta): Promise<void> {
  const owner = {
    workspaceId: meta.workspaceId,
    parentSessionId: meta.parentSessionId,
    sessionId: meta.sessionId,
  };
  const parsed = parseMeta(meta);
  await withWriteQueue(owner, async () => {
    assertWritable(owner);
    writeFileAtomicSync(
      spawnedSessionMetaPath(owner.workspaceId, owner.parentSessionId, owner.sessionId),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
  });
}

export async function patchSpawnedSessionMeta(
  owner: SpawnedStoreOwner,
  patch:
    Partial<SpawnedSessionMeta> | ((current: SpawnedSessionMeta) => Partial<SpawnedSessionMeta>)
): Promise<SpawnedSessionMeta | null> {
  return withWriteQueue(owner, async () => {
    const path = spawnedSessionMetaPath(owner.workspaceId, owner.parentSessionId, owner.sessionId);
    let current: SpawnedSessionMeta;
    try {
      current = parseMeta(JSON.parse(await fs.readFile(path, "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const delta = typeof patch === "function" ? patch(current) : patch;
    const next = parseMeta({ ...current, ...delta });
    assertWritable(owner);
    writeFileAtomicSync(path, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  });
}

export async function appendSpawnedSessionMessage(
  owner: SpawnedStoreOwner,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await withWriteQueue(owner, async () => {
    const path = spawnedSessionMessagesPath(
      owner.workspaceId,
      owner.parentSessionId,
      owner.sessionId
    );
    assertWritable(owner);
    await appendMessageJsonl(path, message);
  });
}

export async function patchSpawnedSessionMessageMetadata(
  owner: SpawnedStoreOwner,
  messageId: string,
  patch: Partial<MessageMeta>
): Promise<boolean> {
  return withWriteQueue(owner, async () => {
    assertWritable(owner);
    return patchMessageJsonlMetadata(
      spawnedSessionMessagesPath(owner.workspaceId, owner.parentSessionId, owner.sessionId),
      messageId,
      patch
    );
  });
}

export async function loadSpawnedSessionMessages(
  owner: SpawnedStoreOwner
): Promise<Array<UIMessage<MessageMeta>>> {
  try {
    const content = await fs.readFile(
      spawnedSessionMessagesPath(owner.workspaceId, owner.parentSessionId, owner.sessionId),
      "utf8"
    );
    return parseJsonlLines<UIMessage<MessageMeta>>(content, "spawned-session-store");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeSpawnedSessionResponse(
  owner: SpawnedStoreOwner,
  responseId: string,
  content: string
): Promise<void> {
  await withWriteQueue(owner, async () => {
    const path = spawnedSessionResponsePath(
      owner.workspaceId,
      owner.parentSessionId,
      owner.sessionId,
      responseId
    );
    await fs.mkdir(
      spawnedSessionResponsesDir(owner.workspaceId, owner.parentSessionId, owner.sessionId),
      { recursive: true }
    );
    assertWritable(owner);
    await fs.writeFile(path, content, { encoding: "utf8", flag: "wx" });
  });
}

interface ResponseCursor {
  version: 1;
  responseId: string;
  offset: number;
}

function encodeCursor(cursor: ResponseCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, responseId: string): number {
  try {
    if (
      !/^[A-Za-z0-9_-]+$/.test(cursor) ||
      Buffer.from(cursor, "base64url").toString("base64url") !== cursor
    ) {
      throw new Error("non-canonical cursor");
    }
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as ResponseCursor;
    if (
      parsed.version !== 1 ||
      parsed.responseId !== responseId ||
      !Number.isSafeInteger(parsed.offset) ||
      parsed.offset < 0
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed.offset;
  } catch {
    throw Object.assign(new Error("Invalid response cursor"), { code: "SPAWN_INVALID_REQUEST" });
  }
}

function decodeSafePrefix(buffer: Buffer): { content: string; bytes: number } {
  let length = buffer.length;
  while (length > 0) {
    try {
      return { content: utf8Decoder.decode(buffer.subarray(0, length)), bytes: length };
    } catch {
      length -= 1;
    }
  }
  return { content: "", bytes: 0 };
}

function chunkFromBuffer(
  buffer: Buffer,
  responseId: string,
  offset: number,
  totalBytes: number
): ReadResponseResult {
  const decoded = decodeSafePrefix(buffer);
  if (buffer.length > 0 && decoded.bytes === 0) {
    throw new Error("Unable to decode a UTF-8 response chunk");
  }
  const nextOffset = offset + decoded.bytes;
  const done = nextOffset >= totalBytes;
  return {
    content: decoded.content,
    done,
    ...(!done ? { nextCursor: encodeCursor({ version: 1, responseId, offset: nextOffset }) } : {}),
  };
}

export function inlineSpawnedResponse(content: string, responseId: string): ReadResponseResult {
  const all = Buffer.from(content, "utf8");
  return chunkFromBuffer(
    all.subarray(0, Math.min(all.length, MAX_INLINE_RESPONSE_BYTES)),
    responseId,
    0,
    all.length
  );
}

export async function readSpawnedSessionResponseChunk(input: {
  owner: SpawnedStoreOwner;
  responseId: string;
  cursor?: string;
  maxBytes?: number;
}): Promise<ReadResponseResult> {
  const maxBytes = input.maxBytes ?? DEFAULT_RESPONSE_CHUNK_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > MAX_RESPONSE_CHUNK_BYTES) {
    throw Object.assign(new Error("maxBytes must be between 4 and 65536"), {
      code: "SPAWN_INVALID_REQUEST",
    });
  }
  const offset = input.cursor ? decodeCursor(input.cursor, input.responseId) : 0;
  const path = spawnedSessionResponsePath(
    input.owner.workspaceId,
    input.owner.parentSessionId,
    input.owner.sessionId,
    input.responseId
  );
  const handle = await fs.open(path, "r");
  try {
    const stat = await handle.stat();
    if (offset > stat.size) {
      throw Object.assign(new Error("Response cursor is beyond end of file"), {
        code: "SPAWN_INVALID_REQUEST",
      });
    }
    const buffer = Buffer.alloc(Math.min(maxBytes, Math.max(0, stat.size - offset)));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    return chunkFromBuffer(buffer.subarray(0, bytesRead), input.responseId, offset, stat.size);
  } finally {
    await handle.close();
  }
}

export async function createSpawnedTurnRecord(record: SpawnedTurnRecord): Promise<void> {
  const parsed = parseTurnRecord(record);
  const owner = {
    workspaceId: parsed.workspaceId,
    parentSessionId: parsed.parentSessionId,
    sessionId: parsed.sessionId,
  };
  assertTurnOwner(parsed, owner);
  await withWriteQueue(owner, async () => {
    const path = spawnedSessionTurnPath(
      owner.workspaceId,
      owner.parentSessionId,
      owner.sessionId,
      parsed.turnId
    );
    await fs.mkdir(dirname(path), { recursive: true });
    try {
      await fs.access(path);
      throw Object.assign(new Error("Spawned turn already exists"), { code: "EEXIST" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    assertWritable(owner);
    writeFileAtomicSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
  });
}

export async function loadSpawnedTurnRecord(
  owner: SpawnedStoreOwner,
  turnId: string
): Promise<SpawnedTurnRecord | null> {
  try {
    const record = parseTurnRecord(
      JSON.parse(
        await fs.readFile(
          spawnedSessionTurnPath(owner.workspaceId, owner.parentSessionId, owner.sessionId, turnId),
          "utf8"
        )
      ) as unknown
    );
    assertTurnOwner(record, owner);
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function patchSpawnedTurnRecord(
  owner: SpawnedStoreOwner,
  turnId: string,
  patch: Partial<SpawnedTurnRecord> | ((current: SpawnedTurnRecord) => Partial<SpawnedTurnRecord>)
): Promise<SpawnedTurnRecord | null> {
  return withWriteQueue(owner, async () => {
    const path = spawnedSessionTurnPath(
      owner.workspaceId,
      owner.parentSessionId,
      owner.sessionId,
      turnId
    );
    let current: SpawnedTurnRecord;
    try {
      current = parseTurnRecord(JSON.parse(await fs.readFile(path, "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    assertTurnOwner(current, owner);
    const delta = typeof patch === "function" ? patch(current) : patch;
    const next = parseTurnRecord({ ...current, ...delta });
    assertTurnOwner(next, owner);
    if (next.turnId !== turnId) {
      throw Object.assign(new Error("Spawned turn identity cannot be changed"), {
        code: "SPAWN_INVALID_REQUEST",
      });
    }
    assertWritable(owner);
    writeFileAtomicSync(path, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  });
}

async function readTurnRecordsFromOwner(owner: SpawnedStoreOwner): Promise<SpawnedTurnRecord[]> {
  let entries;
  try {
    entries = await fs.readdir(
      spawnedSessionTurnsDir(owner.workspaceId, owner.parentSessionId, owner.sessionId),
      { withFileTypes: true }
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: SpawnedTurnRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const turnId = entry.name.slice(0, -".json".length);
    try {
      const record = await loadSpawnedTurnRecord(owner, turnId);
      if (record) records.push(record);
    } catch {
      // 单个损坏记录不能阻断同一 Workspace 其余通知的恢复。
    }
  }
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function listSpawnedTurnRecords(
  owner: SpawnedStoreOwner
): Promise<SpawnedTurnRecord[]> {
  return readTurnRecordsFromOwner(owner);
}

export async function loadLatestSpawnedTurnRecord(
  owner: SpawnedStoreOwner
): Promise<SpawnedTurnRecord | null> {
  const records = await readTurnRecordsFromOwner(owner);
  return records.at(-1) ?? null;
}

export async function listSpawnedSessionsForParent(input: {
  workspaceId: string;
  parentSessionId: string;
}): Promise<SpawnedSessionStoredView[]> {
  let entries;
  try {
    entries = await fs.readdir(spawnedSessionsDir(input.workspaceId, input.parentSessionId), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const sessions: SpawnedSessionStoredView[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const owner = { ...input, sessionId: entry.name };
    try {
      const meta = await loadSpawnedSessionMeta(owner);
      if (
        !meta ||
        meta.workspaceId !== input.workspaceId ||
        meta.parentSessionId !== input.parentSessionId ||
        meta.sessionId !== entry.name
      ) {
        continue;
      }
      const [turns, messages] = await Promise.all([
        listSpawnedTurnRecords(owner),
        loadSpawnedSessionMessages(owner),
      ]);
      sessions.push({ meta, turns, messages });
    } catch {
      // 单个损坏Session不得阻断同一父Session下的其余查询结果。
    }
  }
  return sessions;
}

export async function listSpawnedTurnRecordsForWorkspace(
  workspaceId: string
): Promise<SpawnedTurnRecord[]> {
  let parents;
  try {
    parents = await fs.readdir(sessionsDir(workspaceId), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: SpawnedTurnRecord[] = [];
  for (const parent of parents) {
    if (!parent.isDirectory()) continue;
    let spawned;
    try {
      spawned = await fs.readdir(spawnedSessionsDir(workspaceId, parent.name), {
        withFileTypes: true,
      });
    } catch {
      continue;
    }
    for (const session of spawned) {
      if (!session.isDirectory()) continue;
      try {
        records.push(
          ...(await readTurnRecordsFromOwner({
            workspaceId,
            parentSessionId: parent.name,
            sessionId: session.name,
          }))
        );
      } catch {
        // 目录名或单个owner损坏时继续处理其他Session。
      }
    }
  }
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function listPendingSpawnNotifications(
  workspaceId: string
): Promise<SpawnedTurnRecord[]> {
  return (await listSpawnedTurnRecordsForWorkspace(workspaceId)).filter(
    (record) => record.notification?.state === "pending"
  );
}

export async function claimSpawnNotification(
  workspaceId: string,
  notificationId: string,
  updatedAt: string
): Promise<SpawnedTurnRecord | null> {
  const candidate = (await listPendingSpawnNotifications(workspaceId)).find(
    (record) => record.notification?.notificationId === notificationId
  );
  if (!candidate) return null;
  const owner = {
    workspaceId: candidate.workspaceId,
    parentSessionId: candidate.parentSessionId,
    sessionId: candidate.sessionId,
  };
  return patchSpawnedTurnRecord(owner, candidate.turnId, (current) => {
    if (
      current.notification?.notificationId !== notificationId ||
      current.notification.state !== "pending"
    ) {
      throw Object.assign(new Error("Spawn notification is no longer pending"), {
        code: "SPAWN_NOTIFICATION_NOT_PENDING",
      });
    }
    return {
      notification: { notificationId, state: "dispatched", updatedAt },
      updatedAt,
    };
  }).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === "SPAWN_NOTIFICATION_NOT_PENDING") return null;
    throw error;
  });
}

export async function setSpawnNotificationState(
  owner: SpawnedStoreOwner,
  turnId: string,
  notificationId: string,
  state: Exclude<SpawnNotificationState, "pending" | "dispatched">,
  updatedAt: string
): Promise<SpawnedTurnRecord | null> {
  return patchSpawnedTurnRecord(owner, turnId, (current) => {
    if (current.notification?.notificationId !== notificationId) {
      throw Object.assign(new Error("Spawn notification identity does not match"), {
        code: "SPAWN_INVALID_REQUEST",
      });
    }
    if (current.notification.state === "suppressed" && state !== "suppressed") return {};
    if (
      (current.notification.state === "delivered" ||
        current.notification.state === "delivery_unknown") &&
      state !== "suppressed"
    ) {
      return {};
    }
    return { notification: { notificationId, state, updatedAt }, updatedAt };
  });
}

export function spawnedMessageToResponseMarkdown(message: UIMessage<MessageMeta> | null): string {
  if (!message) return "";
  const sections: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text) sections.push(part.text);
      continue;
    }
    if (part.type === "dynamic-tool") {
      const title = part.title ?? part.toolName;
      if (title) sections.push(`### Tool: ${title}`);
    }
  }
  return sections.join("\n\n");
}

export function fenceSpawnedSessionParent(workspaceId: string, parentSessionId: string): void {
  fencedParents.add(parentKey(workspaceId, parentSessionId));
}

export async function deleteSpawnedSessionParent(
  workspaceId: string,
  parentSessionId: string
): Promise<void> {
  fenceSpawnedSessionParent(workspaceId, parentSessionId);
  await Promise.allSettled(
    [...writeQueues.entries()]
      .filter(([key]) => key.startsWith(`${parentKey(workspaceId, parentSessionId)}\0`))
      .map(([, queue]) => queue)
  );
  await fs.rm(spawnedSessionsDir(workspaceId, parentSessionId), {
    recursive: true,
    force: true,
  });
}

export function beginSpawnedSessionStoreShutdown(): void {
  shuttingDown = true;
}

export function resetSpawnedSessionStoreForTests(): void {
  fencedParents.clear();
  shuttingDown = false;
  writeQueues.clear();
}
