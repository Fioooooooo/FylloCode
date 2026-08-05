import * as nodeFs from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { mcpEventsDir } from "@main/infra/storage/workspace-paths";
import logger from "@main/infra/logger";
import type { McpEvent, McpPlanEvent, McpProposalEvent } from "@shared/types/mcp-event";
import {
  ensureChatSubject,
  recordPlan,
  recordProposal,
  recordRepositoryProposalRelation,
} from "./lineage-service";
import { proposalStatusService } from "@main/services/proposal/_public";
import {
  getRequiredWorkspaceInfo,
  resolveRepositoryTarget,
} from "@main/services/workspace/_public";

type ConsumerState = {
  watcher: nodeFs.FSWatcher | null;
  closed: boolean;
  scanPromise: Promise<void> | null;
  scanQueued: boolean;
};

const consumers = new Map<string, ConsumerState>();
let shuttingDown = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMcpProposalEvent(value: unknown): value is McpProposalEvent {
  return (
    isRecord(value) &&
    value.server === "fyllo-specs" &&
    value.tool === "create-proposal" &&
    typeof value.createdAt === "string" &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.workspaceId === "string" &&
    value.workspaceId.length > 0 &&
    isRecord(value.proposalRef) &&
    typeof value.proposalRef.folderId === "string" &&
    value.proposalRef.folderId.length > 0 &&
    typeof value.proposalRef.changeId === "string" &&
    value.proposalRef.changeId.length > 0 &&
    (value.worktreeMode === "main" || value.worktreeMode === "linked") &&
    typeof value.worktreePath === "string" &&
    value.worktreePath.length > 0
  );
}

function isMcpPlanEvent(value: unknown): value is McpPlanEvent {
  return (
    isRecord(value) &&
    value.server === "fyllo-specs" &&
    value.tool === "create-plan" &&
    typeof value.createdAt === "string" &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.workspaceId === "string" &&
    value.workspaceId.length > 0 &&
    typeof value.planSlug === "string" &&
    value.planSlug.length > 0
  );
}

function isMcpEvent(value: unknown): value is McpEvent {
  return isMcpProposalEvent(value) || isMcpPlanEvent(value);
}

async function consumeEventFile(
  workspaceId: string,
  eventDir: string,
  fileName: string
): Promise<void> {
  const filePath = join(eventDir, fileName);
  let event: McpEvent;
  try {
    event = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown as McpEvent;
  } catch (error: unknown) {
    logger.warn(`[lineage-mcp-event] skipped unreadable event file: ${filePath}`, error);
    return;
  }

  if (!isMcpEvent(event)) {
    logger.warn(`[lineage-mcp-event] skipped invalid event file: ${filePath}`);
    return;
  }

  if (event.workspaceId !== workspaceId) {
    logger.warn(
      `[lineage-mcp-event] skipped event for another Workspace: expected=${workspaceId} actual=${event.workspaceId}`
    );
    return;
  }

  try {
    if (event.tool === "create-proposal") {
      const workspace = await getRequiredWorkspaceInfo(workspaceId);
      const folderId = event.proposalRef.folderId;
      const owner = workspace.folders.find((folder) => folder.folderId === folderId);
      if (!owner || owner.pathMissing) {
        logger.warn(
          `[lineage-mcp-event] skipped event with unauthorized Folder: workspace=${workspaceId} folder=${folderId}`
        );
        return;
      }
      const target = await resolveRepositoryTarget({
        workspaceId,
        folderId,
        worktreePath: event.worktreePath,
      });
      const isMain = target.worktreePath === owner.folderPath;
      if ((event.worktreeMode === "main") !== isMain) {
        logger.warn(
          `[lineage-mcp-event] skipped event with mismatched worktree mode: workspace=${workspaceId} folder=${folderId}`
        );
        return;
      }
    }
    let subject =
      event.tool === "create-proposal"
        ? await recordProposal(workspaceId, event.sessionId, event.proposalRef)
        : await recordPlan(workspaceId, event.sessionId, event.planSlug);

    if (!subject) {
      await ensureChatSubject(workspaceId, event.sessionId);
      subject =
        event.tool === "create-proposal"
          ? await recordProposal(workspaceId, event.sessionId, event.proposalRef)
          : await recordPlan(workspaceId, event.sessionId, event.planSlug);
    }

    if (!subject) {
      const target =
        event.tool === "create-proposal"
          ? `change=${event.proposalRef.changeId}`
          : `plan=${event.planSlug}`;
      logger.warn(
        `[lineage-mcp-event] event could not be linked; session=${event.sessionId} ${target}`
      );
      return;
    }

    if (event.tool === "create-proposal") {
      const relationResult = await recordRepositoryProposalRelation(event.proposalRef, {
        workspaceId,
        subjectId: subject.id,
        relation: "origin",
        linkedAt: event.createdAt,
      });
      if (relationResult.status === "failed") {
        throw new Error(
          `Failed to record proposal origin: ${relationResult.error.type}: ${relationResult.error.message}`
        );
      }
      if (relationResult.status === "conflict") {
        logger.warn("[lineage-mcp-event] proposal origin conflict", {
          workspaceId,
          proposalRef: event.proposalRef,
          existing: relationResult.existing,
        });
      }
      proposalStatusService.watchProposal(
        workspaceId,
        event.proposalRef,
        event.worktreePath,
        event.sessionId
      );
    }

    await fs.unlink(filePath);
  } catch (error: unknown) {
    logger.error(`[lineage-mcp-event] failed to consume event file: ${filePath}`, error);
  }
}

async function scanWorkspaceEvents(workspaceId: string): Promise<void> {
  const eventDir = mcpEventsDir(workspaceId);
  let files: string[];
  try {
    files = await fs.readdir(eventDir);
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code !== "ENOENT") {
      logger.warn(`[lineage-mcp-event] failed to scan event dir: ${eventDir}`, error);
    }
    return;
  }

  for (const fileName of files) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    await consumeEventFile(workspaceId, eventDir, fileName);
  }
}

function triggerScan(workspaceId: string, state: ConsumerState): Promise<void> {
  if (state.closed) {
    return Promise.resolve();
  }

  if (state.scanPromise) {
    state.scanQueued = true;
    return state.scanPromise;
  }

  state.scanPromise = scanWorkspaceEvents(workspaceId)
    .catch((error: unknown) => {
      logger.error(`[lineage-mcp-event] scan failed for workspace=${workspaceId}`, error);
    })
    .finally(() => {
      state.scanPromise = null;
      if (state.closed || !state.scanQueued) {
        return;
      }
      state.scanQueued = false;
      void triggerScan(workspaceId, state);
    });

  return state.scanPromise;
}

async function startConsumer(workspaceId: string, state: ConsumerState): Promise<void> {
  const eventDir = mcpEventsDir(workspaceId);
  try {
    await fs.mkdir(eventDir, { recursive: true });
    await triggerScan(workspaceId, state);
    if (state.closed) {
      return;
    }

    const watcher = nodeFs.watch(eventDir, () => {
      void triggerScan(workspaceId, state);
    });
    watcher.on("error", (error) => {
      logger.warn(`[lineage-mcp-event] watcher error for workspace=${workspaceId}`, error);
    });
    state.watcher = watcher;
  } catch (error: unknown) {
    consumers.delete(workspaceId);
    logger.error(
      `[lineage-mcp-event] failed to start consumer for workspace=${workspaceId}`,
      error
    );
  }
}

export function ensureLineageEventConsumer(workspaceId: string): void {
  if (shuttingDown) {
    return;
  }
  if (consumers.has(workspaceId)) {
    return;
  }

  const state: ConsumerState = {
    watcher: null,
    closed: false,
    scanPromise: null,
    scanQueued: false,
  };
  consumers.set(workspaceId, state);
  void startConsumer(workspaceId, state);
}

export function disposeWorkspace(workspaceId: string): void {
  const state = consumers.get(workspaceId);
  if (!state) {
    return;
  }

  state.closed = true;
  state.watcher?.close();
  consumers.delete(workspaceId);
}

export function beginLineageEventConsumerShutdown(): void {
  shuttingDown = true;
}

export function disposeLineageEventConsumers(): void {
  beginLineageEventConsumerShutdown();
  for (const state of consumers.values()) {
    state.closed = true;
    state.watcher?.close();
  }
  consumers.clear();
}

export function forceDisposeLineageEventConsumers(): void {
  disposeLineageEventConsumers();
}

export function resetLineageEventConsumersForTests(): void {
  disposeLineageEventConsumers();
  shuttingDown = false;
}
