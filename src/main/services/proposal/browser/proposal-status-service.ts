import { watch, type FSWatcher } from "fs";
import { join } from "path";
import {
  proposalRefKey,
  type ProposalRef,
  type ProposalStatus,
  type ProposalStatusChangedPayload,
} from "@shared/types/proposal";
import {
  parseYamlStatus,
  readIfExists,
  resolveChangeDirInTarget,
} from "@main/infra/proposal/openspec-reader";
import logger from "@main/infra/logger";

interface WatchedProposal {
  watcher: FSWatcher;
  workspaceId: string;
  proposalRef: ProposalRef;
  worktreePath: string;
  sessionIds: Set<string>;
  currentStatus: ProposalStatus;
  watchedPath: string;
}

interface PendingWatch {
  workspaceId: string;
  proposalRef: ProposalRef;
  worktreePath: string;
  sessionIds: Set<string>;
  cancelled: boolean;
}

class ProposalStatusService {
  private readonly watches = new Map<string, WatchedProposal>();
  private readonly pendingWatches = new Map<string, PendingWatch>();
  private readonly listeners = new Set<(payload: ProposalStatusChangedPayload) => void>();

  watchProposal(
    workspaceId: string,
    proposalRef: ProposalRef,
    worktreePath: string,
    sessionId: string
  ): void {
    const key = this.watchKey(workspaceId, proposalRef);
    const watched = this.watches.get(key);
    if (watched) {
      watched.sessionIds.add(sessionId);
      this.emitForSession(watched, sessionId, { status: watched.currentStatus });
      return;
    }

    const pending = this.pendingWatches.get(key);
    if (pending) {
      pending.sessionIds.add(sessionId);
      return;
    }

    const pendingWatch: PendingWatch = {
      workspaceId,
      proposalRef,
      worktreePath,
      sessionIds: new Set([sessionId]),
      cancelled: false,
    };
    this.pendingWatches.set(key, pendingWatch);
    void this.startWatch(key, pendingWatch).finally(() => {
      this.pendingWatches.delete(key);
    });
  }

  private async startWatch(key: string, pending: PendingWatch): Promise<void> {
    const { workspaceId, proposalRef, worktreePath, sessionIds } = pending;
    const resolvedDir = await resolveChangeDirInTarget(worktreePath, proposalRef.changeId);
    if (pending.cancelled || this.pendingWatches.get(key) !== pending) return;

    if (!resolvedDir) {
      for (const sessionId of sessionIds) {
        this.emit({
          workspaceId,
          proposalRef,
          sessionId,
          status: "draft",
          updatedAt: new Date().toISOString(),
          removed: true,
        });
      }
      return;
    }

    const watchedPath = join(resolvedDir, ".openspec.yaml");
    const currentStatus = (await this.readStatus(watchedPath)) ?? "draft";
    if (pending.cancelled || this.pendingWatches.get(key) !== pending) return;

    const watcher = this.createWatcher(key, proposalRef, watchedPath);
    const watched: WatchedProposal = {
      watcher,
      workspaceId,
      proposalRef,
      worktreePath,
      sessionIds: new Set(sessionIds),
      currentStatus,
      watchedPath,
    };
    this.watches.set(key, watched);
    this.emitForAllSessions(watched, { status: currentStatus });
  }

  private createWatcher(key: string, proposalRef: ProposalRef, watchedPath: string): FSWatcher {
    const watcher = watch(watchedPath, () => {
      void this.handleWatchEvent(key);
    });
    watcher.on("error", (error: unknown) => {
      logger.warn(`[proposal-status] watcher error for ${proposalRef.changeId}`, error);
    });
    return watcher;
  }

  private async readStatus(watchedPath: string): Promise<ProposalStatus | null> {
    const content = await readIfExists(watchedPath);
    return content ? parseYamlStatus(content) : null;
  }

  private async handleWatchEvent(key: string): Promise<void> {
    const watched = this.watches.get(key);
    if (!watched) return;

    let status = await this.readStatus(watched.watchedPath);
    if (status !== null) {
      if (status !== watched.currentStatus) {
        watched.currentStatus = status;
        this.emitForAllSessions(watched, { status });
      }
      return;
    }

    const resolvedDir = await resolveChangeDirInTarget(
      watched.worktreePath,
      watched.proposalRef.changeId
    );
    if (!resolvedDir) {
      this.emitForAllSessions(watched, { status: watched.currentStatus, removed: true });
      this.unwatchByKey(key);
      return;
    }

    const newWatchedPath = join(resolvedDir, ".openspec.yaml");
    status = (await this.readStatus(newWatchedPath)) ?? "draft";
    watched.watcher.close();
    watched.watcher = this.createWatcher(key, watched.proposalRef, newWatchedPath);
    watched.watchedPath = newWatchedPath;
    if (status !== watched.currentStatus) {
      watched.currentStatus = status;
      this.emitForAllSessions(watched, { status });
    }
  }

  unwatchProposal(workspaceId: string, proposalRef: ProposalRef, sessionId?: string): void {
    const key = this.watchKey(workspaceId, proposalRef);
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
    if (!watched) return;
    watched.sessionIds.delete(sessionId);
    if (watched.sessionIds.size === 0) this.unwatchByKey(key);
  }

  unwatchWorkspace(workspaceId: string): void {
    for (const [key, pending] of this.pendingWatches) {
      if (pending.workspaceId === workspaceId) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
    }
    for (const [key, watched] of this.watches) {
      if (watched.workspaceId === workspaceId) this.unwatchByKey(key);
    }
  }

  hasWorkspaceReferences(workspaceId: string): boolean {
    return (
      [...this.pendingWatches.values()].some((pending) => pending.workspaceId === workspaceId) ||
      [...this.watches.values()].some((watched) => watched.workspaceId === workspaceId)
    );
  }

  private unwatchByKey(key: string): void {
    const watched = this.watches.get(key);
    if (!watched) return;
    watched.watcher.close();
    this.watches.delete(key);
  }

  unwatchAll(): void {
    for (const pending of this.pendingWatches.values()) pending.cancelled = true;
    this.pendingWatches.clear();
    for (const [key] of this.watches) this.unwatchByKey(key);
  }

  onStatusChanged(listener: (payload: ProposalStatusChangedPayload) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
      workspaceId: watched.workspaceId,
      proposalRef: watched.proposalRef,
      sessionId,
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
    for (const sessionId of watched.sessionIds) this.emitForSession(watched, sessionId, event);
  }

  private watchKey(workspaceId: string, proposalRef: ProposalRef): string {
    return `${workspaceId}::${proposalRefKey(proposalRef)}`;
  }
}

export const proposalStatusService = new ProposalStatusService();
