import { promises as fs } from "fs";
import { join } from "path";
import logger from "@main/infra/logger";
import { applyRunsDir } from "@main/infra/storage/workspace-paths";
import { parseJsonlLines } from "@main/infra/storage/jsonl";
import type { ApplyRunMeta, ArchiveRunMeta, ProposalRef } from "@shared/types/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";
import { appendMessageJsonl, patchMessageJsonlMetadata } from "./message-jsonl-store";

export function applyRunDir(workspaceId: string, proposalRef: ProposalRef): string {
  return join(applyRunsDir(workspaceId), proposalRef.folderId, proposalRef.changeId);
}

function legacyApplyRunDir(workspaceId: string, changeId: string): string {
  return join(applyRunsDir(workspaceId), changeId);
}

function runMetaPath(workspaceId: string, proposalRef: ProposalRef): string {
  return join(applyRunDir(workspaceId, proposalRef), "run.json");
}

export function stageMessagesPath(
  workspaceId: string,
  proposalRef: ProposalRef,
  stageIndex: number
): string {
  return join(applyRunDir(workspaceId, proposalRef), `stage-${stageIndex}.messages.jsonl`);
}

export function archiveRunMetaPath(workspaceId: string, proposalRef: ProposalRef): string {
  return join(applyRunDir(workspaceId, proposalRef), "archive.json");
}

export function archiveMessagesPath(workspaceId: string, proposalRef: ProposalRef): string {
  return join(applyRunDir(workspaceId, proposalRef), "archive.messages.jsonl");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function saveApplyRunMeta(workspaceId: string, meta: ApplyRunMeta): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, meta.proposalRef));
  await fs.writeFile(
    runMetaPath(workspaceId, meta.proposalRef),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadApplyRunMeta(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ApplyRunMeta | null> {
  const current = await readJsonIfExists<ApplyRunMeta>(runMetaPath(workspaceId, proposalRef));
  if (current) return current;

  // Ownerless v1 runs remain visible for history, but activation rejects them.
  return readJsonIfExists<ApplyRunMeta>(
    join(legacyApplyRunDir(workspaceId, proposalRef.changeId), "run.json")
  );
}

export async function updateRunMetaIfCurrent(
  workspaceId: string,
  proposalRef: ProposalRef,
  runId: string,
  updater: (meta: ApplyRunMeta) => ApplyRunMeta
): Promise<void> {
  const current = await loadApplyRunMeta(workspaceId, proposalRef);
  if (!current || current.runId !== runId || !sameProposalRef(current.proposalRef, proposalRef)) {
    return;
  }
  await saveApplyRunMeta(workspaceId, updater(current));
}

function sameProposalRef(left: ProposalRef | undefined, right: ProposalRef): boolean {
  return left?.folderId === right.folderId && left.changeId === right.changeId;
}

export async function updateApplyRunStageAcpSessionId(
  workspaceId: string,
  proposalRef: ProposalRef,
  runId: string,
  stageIndex: number,
  acpSessionId: string
): Promise<void> {
  await updateRunMetaIfCurrent(workspaceId, proposalRef, runId, (meta) => ({
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
  proposalRef: ProposalRef,
  stageIndex: number,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await appendMessageJsonl(stageMessagesPath(workspaceId, proposalRef, stageIndex), message);
}

export async function patchApplyRunMessageMetadata(
  workspaceId: string,
  proposalRef: ProposalRef,
  stageIndex: number,
  messageId: string,
  patch: Partial<MessageMeta>
): Promise<boolean> {
  return patchMessageJsonlMetadata(
    stageMessagesPath(workspaceId, proposalRef, stageIndex),
    messageId,
    patch
  );
}

export async function loadApplyRunMessages(
  workspaceId: string,
  proposalRef: ProposalRef,
  stageIndex: number
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(
      stageMessagesPath(workspaceId, proposalRef, stageIndex),
      "utf8"
    );
    return parseJsonlLines<UIMessage<MessageMeta>>(content, "apply-run-store");
  } catch {
    try {
      const legacyPath = join(
        legacyApplyRunDir(workspaceId, proposalRef.changeId),
        `stage-${stageIndex}.messages.jsonl`
      );
      return parseJsonlLines<UIMessage<MessageMeta>>(
        await fs.readFile(legacyPath, "utf8"),
        "apply-run-store"
      );
    } catch {
      return [];
    }
  }
}

export async function saveArchiveRunMeta(workspaceId: string, meta: ArchiveRunMeta): Promise<void> {
  await ensureDir(applyRunDir(workspaceId, meta.proposalRef));
  await fs.writeFile(
    archiveRunMetaPath(workspaceId, meta.proposalRef),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadArchiveRunMeta(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ArchiveRunMeta | null> {
  const current = await readJsonIfExists<ArchiveRunMeta>(
    archiveRunMetaPath(workspaceId, proposalRef)
  );
  if (current) return current;
  return readJsonIfExists<ArchiveRunMeta>(
    join(legacyApplyRunDir(workspaceId, proposalRef.changeId), "archive.json")
  );
}

export async function updateArchiveRunAcpSessionId(
  workspaceId: string,
  proposalRef: ProposalRef,
  acpSessionId: string
): Promise<void> {
  const existing = await loadArchiveRunMeta(workspaceId, proposalRef);
  if (!existing || !sameProposalRef(existing.proposalRef, proposalRef)) {
    logger.warn(
      `[apply-run-store] archive run meta missing or ownerless while persisting acpSessionId for change ${proposalRef.changeId}`
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
  proposalRef: ProposalRef,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await appendMessageJsonl(archiveMessagesPath(workspaceId, proposalRef), message);
}

export async function patchArchiveMessageMetadata(
  workspaceId: string,
  proposalRef: ProposalRef,
  messageId: string,
  patch: Partial<MessageMeta>
): Promise<boolean> {
  return patchMessageJsonlMetadata(archiveMessagesPath(workspaceId, proposalRef), messageId, patch);
}

export async function loadArchiveMessages(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(archiveMessagesPath(workspaceId, proposalRef), "utf8");
    return parseJsonlLines<UIMessage<MessageMeta>>(content, "apply-run-store");
  } catch {
    try {
      const legacyPath = join(
        legacyApplyRunDir(workspaceId, proposalRef.changeId),
        "archive.messages.jsonl"
      );
      return parseJsonlLines<UIMessage<MessageMeta>>(
        await fs.readFile(legacyPath, "utf8"),
        "apply-run-store"
      );
    } catch {
      return [];
    }
  }
}
