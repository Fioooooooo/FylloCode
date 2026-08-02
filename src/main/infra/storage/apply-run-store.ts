import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { applyRunsDir } from "@main/infra/storage/workspace-paths";
import { parseJsonlLines } from "@main/infra/storage/jsonl";
import type { ApplyRunMeta, ArchiveRunMeta } from "@shared/types/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export function applyRunDir(workspaceId: string, changeId: string): string {
  return join(applyRunsDir(workspaceId), changeId);
}

function runMetaPath(workspaceId: string, changeId: string): string {
  return join(applyRunDir(workspaceId, changeId), "run.json");
}

export function stageMessagesPath(
  workspaceId: string,
  changeId: string,
  stageIndex: number
): string {
  return join(applyRunDir(workspaceId, changeId), `stage-${stageIndex}.messages.jsonl`);
}

export function archiveRunMetaPath(workspaceId: string, changeId: string): string {
  return join(applyRunDir(workspaceId, changeId), "archive.json");
}

export function archiveMessagesPath(workspaceId: string, changeId: string): string {
  return join(applyRunDir(workspaceId, changeId), "archive.messages.jsonl");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveApplyRunMeta(workspaceId: string, meta: ApplyRunMeta): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, meta.changeId));
  await fs.writeFile(
    runMetaPath(workspaceId, meta.changeId),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadApplyRunMeta(
  workspaceId: string,
  changeId: string
): Promise<ApplyRunMeta | null> {
  try {
    const content = await fs.readFile(runMetaPath(workspaceId, changeId), "utf8");
    return JSON.parse(content) as ApplyRunMeta;
  } catch {
    return null;
  }
}

export async function updateRunMetaIfCurrent(
  workspaceId: string,
  changeId: string,
  runId: string,
  updater: (meta: ApplyRunMeta) => ApplyRunMeta
): Promise<void> {
  const current = await loadApplyRunMeta(workspaceId, changeId);
  if (!current || current.runId !== runId) return;
  await saveApplyRunMeta(workspaceId, updater(current));
}

export async function updateApplyRunStageAcpSessionId(
  workspaceId: string,
  changeId: string,
  runId: string,
  stageIndex: number,
  acpSessionId: string
): Promise<void> {
  await updateRunMetaIfCurrent(workspaceId, changeId, runId, (meta) => ({
    ...meta,
    stageAcpSessionIds: {
      ...meta.stageAcpSessionIds,
      [stageIndex]: acpSessionId,
    },
    updatedAt: new Date().toISOString(),
  }));
}

export async function appendApplyRunMessage(
  workspaceId: string,
  changeId: string,
  stageIndex: number,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, changeId));
  await fs.appendFile(
    stageMessagesPath(workspaceId, changeId, stageIndex),
    `${JSON.stringify(message)}\n`,
    "utf8"
  );
}

export async function loadApplyRunMessages(
  workspaceId: string,
  changeId: string,
  stageIndex: number
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(stageMessagesPath(workspaceId, changeId, stageIndex), "utf8");
    return parseJsonlLines<UIMessage<MessageMeta>>(content, "apply-run-store");
  } catch {
    return [];
  }
}

export async function saveArchiveRunMeta(workspaceId: string, meta: ArchiveRunMeta): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, meta.changeId));
  await fs.writeFile(
    archiveRunMetaPath(workspaceId, meta.changeId),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadArchiveRunMeta(
  workspaceId: string,
  changeId: string
): Promise<ArchiveRunMeta | null> {
  try {
    const content = await fs.readFile(archiveRunMetaPath(workspaceId, changeId), "utf8");
    return JSON.parse(content) as ArchiveRunMeta;
  } catch {
    return null;
  }
}

export async function updateArchiveRunAcpSessionId(
  workspaceId: string,
  changeId: string,
  acpSessionId: string
): Promise<void> {
  const existing = await loadArchiveRunMeta(workspaceId, changeId);
  if (!existing) {
    logger.warn(
      `[apply-run-store] archive run meta missing while persisting acpSessionId for change ${changeId}`
    );
    return;
  }

  await saveArchiveRunMeta(workspaceId, {
    ...existing,
    acpSessionId,
    updatedAt: new Date().toISOString(),
  });
}

export async function appendArchiveMessage(
  workspaceId: string,
  changeId: string,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, changeId));
  await fs.appendFile(
    archiveMessagesPath(workspaceId, changeId),
    `${JSON.stringify(message)}\n`,
    "utf8"
  );
}

export async function loadArchiveMessages(
  workspaceId: string,
  changeId: string
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(archiveMessagesPath(workspaceId, changeId), "utf8");
    return parseJsonlLines<UIMessage<MessageMeta>>(content, "apply-run-store");
  } catch {
    return [];
  }
}
