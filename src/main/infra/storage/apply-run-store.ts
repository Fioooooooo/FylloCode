import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { applyRunsDir } from "@main/infra/storage/project-paths";
import type { ApplyRunMeta, ArchiveRunMeta } from "@shared/types/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export function applyRunDir(projectPath: string, changeId: string): string {
  return join(applyRunsDir(projectPath), changeId);
}

function runMetaPath(projectPath: string, changeId: string): string {
  return join(applyRunDir(projectPath, changeId), "run.json");
}

export function stageMessagesPath(
  projectPath: string,
  changeId: string,
  stageIndex: number
): string {
  return join(applyRunDir(projectPath, changeId), `stage-${stageIndex}.messages.jsonl`);
}

export function archiveRunMetaPath(projectPath: string, changeId: string): string {
  return join(applyRunDir(projectPath, changeId), "archive.json");
}

export function archiveMessagesPath(projectPath: string, changeId: string): string {
  return join(applyRunDir(projectPath, changeId), "archive.messages.jsonl");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveApplyRunMeta(projectPath: string, meta: ApplyRunMeta): Promise<void> {
  await ensureDir(applyRunDir(projectPath, meta.changeId));
  await fs.writeFile(
    runMetaPath(projectPath, meta.changeId),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadApplyRunMeta(
  projectPath: string,
  changeId: string
): Promise<ApplyRunMeta | null> {
  try {
    const content = await fs.readFile(runMetaPath(projectPath, changeId), "utf8");
    return JSON.parse(content) as ApplyRunMeta;
  } catch {
    return null;
  }
}

export async function updateRunMetaIfCurrent(
  projectPath: string,
  changeId: string,
  runId: string,
  updater: (meta: ApplyRunMeta) => ApplyRunMeta
): Promise<void> {
  const current = await loadApplyRunMeta(projectPath, changeId);
  if (!current || current.runId !== runId) return;
  await saveApplyRunMeta(projectPath, updater(current));
}

export async function updateApplyRunStageAcpSessionId(
  projectPath: string,
  changeId: string,
  runId: string,
  stageIndex: number,
  acpSessionId: string
): Promise<void> {
  await updateRunMetaIfCurrent(projectPath, changeId, runId, (meta) => ({
    ...meta,
    stageAcpSessionIds: {
      ...meta.stageAcpSessionIds,
      [stageIndex]: acpSessionId,
    },
    updatedAt: new Date().toISOString(),
  }));
}

export async function appendApplyRunMessage(
  projectPath: string,
  changeId: string,
  stageIndex: number,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(applyRunDir(projectPath, changeId));
  await fs.appendFile(
    stageMessagesPath(projectPath, changeId, stageIndex),
    `${JSON.stringify(message)}\n`,
    "utf8"
  );
}

export async function loadApplyRunMessages(
  projectPath: string,
  changeId: string,
  stageIndex: number
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(stageMessagesPath(projectPath, changeId, stageIndex), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  } catch {
    return [];
  }
}

export async function saveArchiveRunMeta(projectPath: string, meta: ArchiveRunMeta): Promise<void> {
  await ensureDir(applyRunDir(projectPath, meta.changeId));
  await fs.writeFile(
    archiveRunMetaPath(projectPath, meta.changeId),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadArchiveRunMeta(
  projectPath: string,
  changeId: string
): Promise<ArchiveRunMeta | null> {
  try {
    const content = await fs.readFile(archiveRunMetaPath(projectPath, changeId), "utf8");
    return JSON.parse(content) as ArchiveRunMeta;
  } catch {
    return null;
  }
}

export async function updateArchiveRunAcpSessionId(
  projectPath: string,
  changeId: string,
  acpSessionId: string
): Promise<void> {
  const existing = await loadArchiveRunMeta(projectPath, changeId);
  if (!existing) {
    logger.warn(
      `[apply-run-store] archive run meta missing while persisting acpSessionId for change ${changeId}`
    );
    return;
  }

  await saveArchiveRunMeta(projectPath, {
    ...existing,
    acpSessionId,
    updatedAt: new Date().toISOString(),
  });
}

export async function appendArchiveMessage(
  projectPath: string,
  changeId: string,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(applyRunDir(projectPath, changeId));
  await fs.appendFile(
    archiveMessagesPath(projectPath, changeId),
    `${JSON.stringify(message)}\n`,
    "utf8"
  );
}

export async function loadArchiveMessages(
  projectPath: string,
  changeId: string
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(archiveMessagesPath(projectPath, changeId), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  } catch {
    return [];
  }
}
