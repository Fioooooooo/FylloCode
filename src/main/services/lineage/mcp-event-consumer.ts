import * as nodeFs from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { registerDisposable } from "@main/bootstrap/lifecycle";
import { encodeProjectPath, mcpEventsDir } from "@main/infra/storage/project-paths";
import logger from "@main/infra/logger";
import type { McpEvent, McpPlanEvent, McpProposalEvent } from "@shared/types/mcp-event";
import { ensureChatSubject, recordPlan, recordProposal } from "./lineage-service";
import { proposalStatusService } from "@main/services/proposal/proposal-status-service";

type ConsumerState = {
  watcher: nodeFs.FSWatcher | null;
  closed: boolean;
  scanPromise: Promise<void> | null;
  scanQueued: boolean;
};

const consumers = new Map<string, ConsumerState>();

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
    typeof value.changeId === "string" &&
    value.changeId.length > 0
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
    typeof value.planSlug === "string" &&
    value.planSlug.length > 0
  );
}

function isMcpEvent(value: unknown): value is McpEvent {
  return isMcpProposalEvent(value) || isMcpPlanEvent(value);
}

async function consumeEventFile(
  projectPath: string,
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

  try {
    let subject =
      event.tool === "create-proposal"
        ? await recordProposal(projectPath, event.sessionId, event.changeId)
        : await recordPlan(projectPath, event.sessionId, event.planSlug);

    if (!subject) {
      await ensureChatSubject(projectPath, event.sessionId);
      subject =
        event.tool === "create-proposal"
          ? await recordProposal(projectPath, event.sessionId, event.changeId)
          : await recordPlan(projectPath, event.sessionId, event.planSlug);
    }

    if (!subject) {
      const target =
        event.tool === "create-proposal" ? `change=${event.changeId}` : `plan=${event.planSlug}`;
      logger.warn(
        `[lineage-mcp-event] event could not be linked; session=${event.sessionId} ${target}`
      );
      return;
    }

    if (event.tool === "create-proposal") {
      proposalStatusService.watchProposal(
        encodeProjectPath(projectPath),
        projectPath,
        event.changeId,
        event.sessionId
      );
    }

    await fs.unlink(filePath);
  } catch (error: unknown) {
    logger.error(`[lineage-mcp-event] failed to consume event file: ${filePath}`, error);
  }
}

async function scanProjectEvents(projectPath: string): Promise<void> {
  const eventDir = mcpEventsDir(projectPath);
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
    await consumeEventFile(projectPath, eventDir, fileName);
  }
}

function triggerScan(projectPath: string, state: ConsumerState): Promise<void> {
  if (state.closed) {
    return Promise.resolve();
  }

  if (state.scanPromise) {
    state.scanQueued = true;
    return state.scanPromise;
  }

  state.scanPromise = scanProjectEvents(projectPath)
    .catch((error: unknown) => {
      logger.error(`[lineage-mcp-event] scan failed for project=${projectPath}`, error);
    })
    .finally(() => {
      state.scanPromise = null;
      if (state.closed || !state.scanQueued) {
        return;
      }
      state.scanQueued = false;
      void triggerScan(projectPath, state);
    });

  return state.scanPromise;
}

async function startConsumer(projectPath: string, state: ConsumerState): Promise<void> {
  const eventDir = mcpEventsDir(projectPath);
  try {
    await fs.mkdir(eventDir, { recursive: true });
    await triggerScan(projectPath, state);
    if (state.closed) {
      return;
    }

    const watcher = nodeFs.watch(eventDir, () => {
      void triggerScan(projectPath, state);
    });
    watcher.on("error", (error) => {
      logger.warn(`[lineage-mcp-event] watcher error for project=${projectPath}`, error);
    });
    state.watcher = watcher;
  } catch (error: unknown) {
    consumers.delete(projectPath);
    logger.error(`[lineage-mcp-event] failed to start consumer for project=${projectPath}`, error);
  }
}

export function ensureLineageEventConsumer(projectPath: string): void {
  if (consumers.has(projectPath)) {
    return;
  }

  const state: ConsumerState = {
    watcher: null,
    closed: false,
    scanPromise: null,
    scanQueued: false,
  };
  consumers.set(projectPath, state);
  void startConsumer(projectPath, state);
}

export function disposeProject(projectPath: string): void {
  const state = consumers.get(projectPath);
  if (!state) {
    return;
  }

  state.closed = true;
  state.watcher?.close();
  consumers.delete(projectPath);
}

function dispose(): void {
  for (const state of consumers.values()) {
    state.closed = true;
    state.watcher?.close();
  }
  consumers.clear();
}

registerDisposable({ name: "lineage-mcp-event-consumer", dispose });
