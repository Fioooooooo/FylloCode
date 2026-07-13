import { watch, type FSWatcher } from "fs";
import { join } from "path";
import type { ProposalStatus, ProposalStatusChangedPayload } from "@shared/types/proposal";
import {
  parseYamlStatus,
  readIfExists,
  resolveChangeDirAnywhere,
} from "@main/infra/proposal/openspec-reader";
import logger from "@main/infra/logger";

interface WatchedProposal {
  watcher: FSWatcher;
  projectId: string;
  projectPath: string;
  sessionIds: Set<string>;
  changeId: string;
  currentStatus: ProposalStatus;
  watchedPath: string;
}

// Tracks a watch that is starting up asynchronously. Used to deduplicate concurrent
// watch requests for the same proposal and to make cancellation safe before the watcher
// has been created.
interface PendingWatch {
  projectId: string;
  projectPath: string;
  changeId: string;
  sessionIds: Set<string>;
  cancelled: boolean;
}

class ProposalStatusService {
  private readonly watches = new Map<string, WatchedProposal>();
  private readonly pendingWatches = new Map<string, PendingWatch>();
  private readonly listeners = new Set<(payload: ProposalStatusChangedPayload) => void>();

  watchProposal(projectId: string, projectPath: string, changeId: string, sessionId: string): void {
    const key = this.watchKey(projectPath, changeId);

    // Already watching: just add the session and immediately emit the current status.
    const watched = this.watches.get(key);
    if (watched) {
      watched.sessionIds.add(sessionId);
      this.emitForSession(watched, sessionId, { status: watched.currentStatus });
      return;
    }

    // Watch is starting but the file watcher hasn't been created yet: deduplicate.
    const pending = this.pendingWatches.get(key);
    if (pending) {
      pending.sessionIds.add(sessionId);
      return;
    }

    // First request for this proposal: register a pending watch and start resolving the path.
    const pendingWatch: PendingWatch = {
      projectId,
      projectPath,
      changeId,
      sessionIds: new Set([sessionId]),
      cancelled: false,
    };
    this.pendingWatches.set(key, pendingWatch);
    void this.startWatch(key, pendingWatch).finally(() => {
      this.pendingWatches.delete(key);
    });
  }

  private async startWatch(key: string, pending: PendingWatch): Promise<void> {
    const { projectId, projectPath, changeId, sessionIds } = pending;
    const resolved = await resolveChangeDirAnywhere(projectPath, changeId);
    if (pending.cancelled || this.pendingWatches.get(key) !== pending) {
      return;
    }

    if (!resolved) {
      for (const sessionId of sessionIds) {
        this.emit({
          projectId,
          changeId,
          sessionId,
          projectPath,
          status: "draft",
          updatedAt: new Date().toISOString(),
          removed: true,
        });
      }
      return;
    }

    const watchedPath = join(resolved.dir, ".openspec.yaml");
    const currentStatus = (await this.readStatus(watchedPath)) ?? "draft";
    if (pending.cancelled || this.pendingWatches.get(key) !== pending) {
      return;
    }

    const watcher = watch(watchedPath, () => {
      void this.handleWatchEvent(this.watchKey(projectPath, changeId));
    });
    watcher.on("error", (error: unknown) => {
      logger.warn(`[proposal-status] watcher error for ${changeId}`, error);
    });

    const watched: WatchedProposal = {
      watcher,
      projectId,
      projectPath,
      sessionIds: new Set(sessionIds),
      changeId,
      currentStatus,
      watchedPath,
    };
    this.watches.set(key, watched);

    this.emitForAllSessions(watched, { status: currentStatus });
  }

  private async readStatus(watchedPath: string): Promise<ProposalStatus | null> {
    const content = await readIfExists(watchedPath);
    if (!content) {
      return null;
    }
    return parseYamlStatus(content);
  }

  private async handleWatchEvent(key: string): Promise<void> {
    const watched = this.watches.get(key);
    if (!watched) {
      return;
    }

    // Fast path: the proposal file still exists at the watched path.
    let status = await this.readStatus(watched.watchedPath);
    if (status !== null) {
      if (status !== watched.currentStatus) {
        watched.currentStatus = status;
        this.emitForAllSessions(watched, { status });
      }
      return;
    }

    // The file disappeared from the watched path. It may have been archived/unarchived,
    // so try to find it elsewhere in the project. If it cannot be found, treat as removed.
    const resolved = await resolveChangeDirAnywhere(watched.projectPath, watched.changeId);
    if (!resolved) {
      this.emitForAllSessions(watched, { status: watched.currentStatus, removed: true });
      this.unwatchByKey(key);
      return;
    }

    // Found at a new location: migrate the watcher and emit any status change.
    const newWatchedPath = join(resolved.dir, ".openspec.yaml");
    status = (await this.readStatus(newWatchedPath)) ?? "draft";

    watched.watcher.close();
    const newWatcher = watch(newWatchedPath, () => {
      void this.handleWatchEvent(key);
    });
    newWatcher.on("error", (error: unknown) => {
      logger.warn(`[proposal-status] watcher error for ${watched.changeId}`, error);
    });
    watched.watcher = newWatcher;
    watched.watchedPath = newWatchedPath;

    if (status !== watched.currentStatus) {
      watched.currentStatus = status;
      this.emitForAllSessions(watched, { status });
    }
  }

  unwatchProposal(projectPath: string, changeId: string, sessionId?: string): void {
    const key = this.watchKey(projectPath, changeId);
    if (!sessionId) {
      const pending = this.pendingWatches.get(key);
      if (pending) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
      this.unwatchByKey(key);
      return;
    }

    const pending = this.pendingWatches.get(key);
    if (pending) {
      pending.sessionIds.delete(sessionId);
      if (pending.sessionIds.size === 0) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
      return;
    }

    const watched = this.watches.get(key);
    if (!watched) {
      return;
    }

    watched.sessionIds.delete(sessionId);
    if (watched.sessionIds.size === 0) {
      this.unwatchByKey(key);
    }
  }

  unwatchProject(projectPath: string): void {
    for (const [key, pending] of this.pendingWatches) {
      if (pending.projectPath === projectPath) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
    }

    for (const [key, watched] of this.watches) {
      if (watched.projectPath === projectPath) {
        this.unwatchByKey(key);
      }
    }
  }

  private unwatchByKey(key: string): void {
    const watched = this.watches.get(key);
    if (!watched) {
      return;
    }
    watched.watcher.close();
    this.watches.delete(key);
  }

  unwatchAll(): void {
    for (const pending of this.pendingWatches.values()) {
      pending.cancelled = true;
    }
    this.pendingWatches.clear();
    for (const [key] of this.watches) {
      this.unwatchByKey(key);
    }
  }

  onStatusChanged(listener: (payload: ProposalStatusChangedPayload) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(payload: ProposalStatusChangedPayload): void {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (error: unknown) {
        logger.warn("[proposal-status] listener error", error);
      }
    }
  }

  private emitForSession(
    watched: WatchedProposal,
    sessionId: string,
    event: Pick<ProposalStatusChangedPayload, "status"> &
      Partial<Pick<ProposalStatusChangedPayload, "removed">>
  ): void {
    this.emit({
      projectId: watched.projectId,
      changeId: watched.changeId,
      sessionId,
      projectPath: watched.projectPath,
      status: event.status,
      updatedAt: new Date().toISOString(),
      ...(event.removed ? { removed: true } : {}),
    });
  }

  private emitForAllSessions(
    watched: WatchedProposal,
    event: Pick<ProposalStatusChangedPayload, "status"> &
      Partial<Pick<ProposalStatusChangedPayload, "removed">>
  ): void {
    for (const sessionId of watched.sessionIds) {
      this.emitForSession(watched, sessionId, event);
    }
  }

  private watchKey(projectPath: string, changeId: string): string {
    return `${projectPath}::${changeId}`;
  }
}

export const proposalStatusService = new ProposalStatusService();
