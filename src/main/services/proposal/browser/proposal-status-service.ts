import { existsSync, watch, type FSWatcher, type WatchEventType } from "fs";
import { isAbsolute, join, relative, sep } from "path";
import {
  proposalRefKey,
  type ProposalRef,
  type ProposalStatus,
  type ProposalStatusChangedPayload,
  type ProposalWorktreeMode,
} from "@shared/types/proposal";
import {
  parseYamlStatus,
  readIfExists,
  resolveChangeDirInTarget,
} from "@main/infra/proposal/openspec-reader";
import logger from "@main/infra/logger";

const RECONCILE_RETRY_DELAYS_MS = [0, 50, 150, 500, 1_000, 2_000] as const;

export interface ProposalWatchContext {
  ownerMainPath: string;
  targetPath: string;
  worktreeMode: ProposalWorktreeMode;
}

interface ResolvedWatchLocation {
  dir: string;
  status: ProposalStatus;
  targetPath: string;
  worktreeMode: ProposalWorktreeMode;
}

interface WatchedProposal {
  contentWatcher: FSWatcher | null;
  locationWatchers: Map<string, FSWatcher>;
  workspaceId: string;
  proposalRef: ProposalRef;
  ownerMainPath: string;
  targetPath: string;
  worktreeMode: ProposalWorktreeMode;
  sessionIds: Set<string>;
  currentStatus: ProposalStatus;
  watchedDir: string;
  reconcileGeneration: number;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
}

interface PendingWatch {
  workspaceId: string;
  proposalRef: ProposalRef;
  context: ProposalWatchContext;
  sessionIds: Set<string>;
  cancelled: boolean;
}

type ProposalWatchReleaseReason =
  | "application-shutdown"
  | "archived-main"
  | "proposal-removed"
  | "proposal-unwatched"
  | "session-removed"
  | "workspace-closed";

class ProposalStatusService {
  private readonly watches = new Map<string, WatchedProposal>();
  private readonly pendingWatches = new Map<string, PendingWatch>();
  private readonly listeners = new Set<(payload: ProposalStatusChangedPayload) => void>();

  watchProposal(
    workspaceId: string,
    proposalRef: ProposalRef,
    context: ProposalWatchContext,
    sessionId: string
  ): void {
    const key = this.watchKey(workspaceId, proposalRef);
    const watched = this.watches.get(key);
    if (watched) {
      watched.sessionIds.add(sessionId);
      this.emitForSession(watched, sessionId, {
        status: watched.currentStatus,
        changeKind: "status",
      });
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
      context,
      sessionIds: new Set([sessionId]),
      cancelled: false,
    };
    this.pendingWatches.set(key, pendingWatch);
    void this.startWatch(key, pendingWatch).finally(() => {
      this.pendingWatches.delete(key);
    });
  }

  private async startWatch(key: string, pending: PendingWatch): Promise<void> {
    const { workspaceId, proposalRef, context, sessionIds } = pending;
    const resolved = await this.resolveInitialLocation(proposalRef, context);
    if (pending.cancelled || this.pendingWatches.get(key) !== pending) return;

    if (!resolved) {
      for (const sessionId of sessionIds) {
        this.emit({
          workspaceId,
          proposalRef,
          sessionId,
          status: "draft",
          changeKind: "status",
          updatedAt: new Date().toISOString(),
          removed: true,
        });
      }
      return;
    }

    const watched: WatchedProposal = {
      contentWatcher: null,
      locationWatchers: new Map(),
      workspaceId,
      proposalRef,
      ownerMainPath: context.ownerMainPath,
      targetPath: resolved.targetPath,
      worktreeMode: resolved.worktreeMode,
      sessionIds: new Set(sessionIds),
      currentStatus: resolved.status,
      watchedDir: resolved.dir,
      reconcileGeneration: 0,
      reconcileTimer: null,
    };
    this.watches.set(key, watched);
    watched.contentWatcher = this.createContentWatcher(key, watched, resolved.dir);
    this.ensureLocationWatchers(key, watched);
    this.emitForAllSessions(watched, { status: resolved.status, changeKind: "status" });
    if (resolved.status === "archived" && resolved.worktreeMode === "main") {
      this.unwatchByKey(key, "archived-main");
    }
  }

  private async resolveInitialLocation(
    proposalRef: ProposalRef,
    context: ProposalWatchContext
  ): Promise<ResolvedWatchLocation | null> {
    const current = await this.resolveLocation(
      context.targetPath,
      context.worktreeMode,
      proposalRef.changeId
    );
    if (current || context.targetPath === context.ownerMainPath) return current;
    return this.resolveLocation(context.ownerMainPath, "main", proposalRef.changeId);
  }

  private createContentWatcher(
    key: string,
    watched: WatchedProposal,
    watchedDir: string
  ): FSWatcher | null {
    try {
      const watcher = watch(watchedDir, (eventType, filename) => {
        this.logWatchEvent(watched, "content", watchedDir, eventType, filename);
        this.handleContentWatchEvent(key, eventType, filename);
      });
      watcher.on("error", (error: unknown) => {
        logger.warn(
          `[proposal-status] content watcher error for ${watched.proposalRef.changeId}`,
          error
        );
        if (watched.contentWatcher === watcher) {
          this.closeContentWatcher(watched, "watcher-error");
        }
        this.requestReconcile(key);
      });
      watched.contentWatcher = watcher;
      this.logWatcherStarted(watched, "content", watchedDir);
      return watcher;
    } catch (error: unknown) {
      logger.warn(`[proposal-status] failed to watch ${watchedDir}`, error);
      return null;
    }
  }

  private handleContentWatchEvent(
    key: string,
    eventType: WatchEventType,
    filename: string | null
  ): void {
    const watched = this.watches.get(key);
    if (!watched) return;

    if (filename === "tasks.md") {
      this.emitForAllSessions(watched, {
        status: watched.currentStatus,
        changeKind: "tasks",
      });
      return;
    }

    if (filename === ".openspec.yaml" || filename === null || eventType === "rename") {
      this.requestReconcile(key);
    }
  }

  private ensureLocationWatchers(key: string, watched: WatchedProposal): void {
    this.ensureLocationWatcher(key, watched, this.changesRoot(watched.targetPath));
    this.ensureLocationWatcher(key, watched, this.changesRoot(watched.ownerMainPath));

    const mainArchiveRoot = this.archiveRoot(watched.ownerMainPath);
    if (existsSync(mainArchiveRoot)) {
      this.ensureLocationWatcher(key, watched, mainArchiveRoot);
    }
  }

  private ensureLocationWatcher(key: string, watched: WatchedProposal, path: string): void {
    if (watched.locationWatchers.has(path) || !existsSync(path)) return;
    try {
      const watcher = watch(path, (eventType, filename) => {
        this.logWatchEvent(watched, "location", path, eventType, filename);
        this.requestReconcile(key);
      });
      watcher.on("error", (error: unknown) => {
        logger.warn(
          `[proposal-status] location watcher error for ${watched.proposalRef.changeId}`,
          error
        );
        this.closeLocationWatcher(watched, path, watcher, "watcher-error");
        this.requestReconcile(key);
      });
      watched.locationWatchers.set(path, watcher);
      this.logWatcherStarted(watched, "location", path);
    } catch (error: unknown) {
      logger.warn(`[proposal-status] failed to watch ${path}`, error);
    }
  }

  private requestReconcile(key: string): void {
    const watched = this.watches.get(key);
    if (!watched) return;
    watched.reconcileGeneration += 1;
    if (watched.reconcileTimer) {
      clearTimeout(watched.reconcileTimer);
      watched.reconcileTimer = null;
    }
    void this.runReconcileAttempt(key, watched.reconcileGeneration, 0);
  }

  private async runReconcileAttempt(
    key: string,
    generation: number,
    attempt: number
  ): Promise<void> {
    const watched = this.watches.get(key);
    if (!watched || watched.reconcileGeneration !== generation) return;
    this.ensureLocationWatchers(key, watched);

    const current = await this.resolveLocation(
      watched.targetPath,
      watched.worktreeMode,
      watched.proposalRef.changeId
    );
    const main =
      watched.targetPath === watched.ownerMainPath
        ? current
        : await this.resolveLocation(watched.ownerMainPath, "main", watched.proposalRef.changeId);
    const latest = this.watches.get(key);
    if (!latest || latest !== watched || latest.reconcileGeneration !== generation) return;

    if (current) {
      this.applyResolvedLocation(key, watched, current);
      if (main?.status === "archived" && attempt + 1 < RECONCILE_RETRY_DELAYS_MS.length) {
        this.scheduleRetry(key, watched, generation, attempt + 1);
      }
      return;
    }

    if (main) {
      this.applyResolvedLocation(key, watched, main);
      return;
    }

    if (attempt + 1 < RECONCILE_RETRY_DELAYS_MS.length) {
      this.scheduleRetry(key, watched, generation, attempt + 1);
      return;
    }

    this.emitForAllSessions(watched, {
      status: watched.currentStatus,
      changeKind: "status",
      removed: true,
    });
    this.unwatchByKey(key, "proposal-removed");
  }

  private scheduleRetry(
    key: string,
    watched: WatchedProposal,
    generation: number,
    attempt: number
  ): void {
    const delay = RECONCILE_RETRY_DELAYS_MS[attempt] ?? 0;
    watched.reconcileTimer = setTimeout(() => {
      watched.reconcileTimer = null;
      void this.runReconcileAttempt(key, generation, attempt);
    }, delay);
  }

  private applyResolvedLocation(
    key: string,
    watched: WatchedProposal,
    resolved: ResolvedWatchLocation
  ): void {
    const targetChanged =
      resolved.targetPath !== watched.targetPath || resolved.worktreeMode !== watched.worktreeMode;
    const directoryChanged = resolved.dir !== watched.watchedDir;
    const shouldRestartContentWatcher = directoryChanged || !watched.contentWatcher;

    if (shouldRestartContentWatcher) {
      this.closeContentWatcher(watched, directoryChanged ? "location-rebound" : "watcher-restart");
    }

    if (targetChanged) {
      this.closeLocationWatchers(watched, "target-rebound");
      watched.targetPath = resolved.targetPath;
      watched.worktreeMode = resolved.worktreeMode;
      this.ensureLocationWatchers(key, watched);
    }

    if (shouldRestartContentWatcher) {
      watched.watchedDir = resolved.dir;
      watched.contentWatcher = this.createContentWatcher(key, watched, resolved.dir);
    }

    if (resolved.status !== watched.currentStatus || targetChanged) {
      watched.currentStatus = resolved.status;
      this.emitForAllSessions(watched, { status: resolved.status, changeKind: "status" });
    }
    if (resolved.status === "archived" && resolved.worktreeMode === "main") {
      this.unwatchByKey(key, "archived-main");
    }
  }

  private async resolveLocation(
    targetPath: string,
    worktreeMode: ProposalWorktreeMode,
    changeId: string
  ): Promise<ResolvedWatchLocation | null> {
    const dir = await resolveChangeDirInTarget(targetPath, changeId);
    if (!dir) return null;
    const status = this.isArchivedLocation(targetPath, dir)
      ? "archived"
      : ((await this.readStatus(dir)) ?? "draft");
    return { dir, status, targetPath, worktreeMode };
  }

  private async readStatus(watchedDir: string): Promise<ProposalStatus | null> {
    const content = await readIfExists(join(watchedDir, ".openspec.yaml"));
    return content ? parseYamlStatus(content) : null;
  }

  private isArchivedLocation(targetPath: string, dir: string): boolean {
    const relativePath = relative(this.archiveRoot(targetPath), dir);
    return (
      relativePath.length > 0 &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath)
    );
  }

  private changesRoot(targetPath: string): string {
    return join(targetPath, "openspec", "changes");
  }

  private archiveRoot(targetPath: string): string {
    return join(this.changesRoot(targetPath), "archive");
  }

  unwatchProposal(workspaceId: string, proposalRef: ProposalRef, sessionId?: string): void {
    const key = this.watchKey(workspaceId, proposalRef);
    if (!sessionId) {
      const pending = this.pendingWatches.get(key);
      if (pending) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
      this.unwatchByKey(key, "proposal-unwatched");
      return;
    }

    this.removeSessionReference(key, sessionId, "proposal-unwatched");
  }

  unwatchSession(workspaceId: string, sessionId: string): void {
    for (const [key, pending] of this.pendingWatches) {
      if (pending.workspaceId === workspaceId) {
        this.removeSessionReference(key, sessionId, "session-removed");
      }
    }
    for (const [key, watched] of this.watches) {
      if (watched.workspaceId === workspaceId) {
        this.removeSessionReference(key, sessionId, "session-removed");
      }
    }
  }

  private removeSessionReference(
    key: string,
    sessionId: string,
    reason: Extract<ProposalWatchReleaseReason, "proposal-unwatched" | "session-removed">
  ): void {
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
    if (watched.sessionIds.size === 0) this.unwatchByKey(key, reason);
  }

  unwatchWorkspace(workspaceId: string): void {
    for (const [key, pending] of this.pendingWatches) {
      if (pending.workspaceId === workspaceId) {
        pending.cancelled = true;
        this.pendingWatches.delete(key);
      }
    }
    for (const [key, watched] of this.watches) {
      if (watched.workspaceId === workspaceId) this.unwatchByKey(key, "workspace-closed");
    }
  }

  hasWorkspaceReferences(workspaceId: string): boolean {
    return (
      [...this.pendingWatches.values()].some((pending) => pending.workspaceId === workspaceId) ||
      [...this.watches.values()].some((watched) => watched.workspaceId === workspaceId)
    );
  }

  private unwatchByKey(key: string, reason: ProposalWatchReleaseReason): void {
    const watched = this.watches.get(key);
    if (!watched) return;
    const releasedWatcherCount = this.watcherCount(watched);
    watched.reconcileGeneration += 1;
    if (watched.reconcileTimer) clearTimeout(watched.reconcileTimer);
    watched.reconcileTimer = null;
    this.closeContentWatcher(watched, reason);
    this.closeLocationWatchers(watched, reason);
    this.watches.delete(key);
    logger.info("[proposal-status] proposal watch released", {
      ...this.logContext(watched),
      reason,
      releasedWatcherCount,
      activeProposalWatchCount: this.watches.size,
    });
  }

  private closeContentWatcher(watched: WatchedProposal, reason: string): void {
    const watcher = watched.contentWatcher;
    if (!watcher) return;
    watched.contentWatcher = null;
    watcher.close();
    this.logWatcherReleased(watched, "content", watched.watchedDir, reason);
  }

  private closeLocationWatcher(
    watched: WatchedProposal,
    path: string,
    watcher: FSWatcher,
    reason: string
  ): void {
    if (watched.locationWatchers.get(path) !== watcher) return;
    watched.locationWatchers.delete(path);
    watcher.close();
    this.logWatcherReleased(watched, "location", path, reason);
  }

  private closeLocationWatchers(watched: WatchedProposal, reason: string): void {
    for (const [path, watcher] of [...watched.locationWatchers]) {
      this.closeLocationWatcher(watched, path, watcher, reason);
    }
  }

  unwatchAll(): void {
    for (const pending of this.pendingWatches.values()) pending.cancelled = true;
    this.pendingWatches.clear();
    for (const [key] of this.watches) this.unwatchByKey(key, "application-shutdown");
  }

  private watcherCount(watched: WatchedProposal): number {
    return (watched.contentWatcher ? 1 : 0) + watched.locationWatchers.size;
  }

  private logContext(watched: WatchedProposal): Record<string, unknown> {
    return {
      workspaceId: watched.workspaceId,
      folderId: watched.proposalRef.folderId,
      changeId: watched.proposalRef.changeId,
      targetPath: watched.targetPath,
      worktreeMode: watched.worktreeMode,
      sessionIds: [...watched.sessionIds],
    };
  }

  private logWatcherStarted(
    watched: WatchedProposal,
    watcherKind: "content" | "location",
    path: string
  ): void {
    logger.info("[proposal-status] watcher started", {
      ...this.logContext(watched),
      watcherKind,
      path,
      watcherCount: this.watcherCount(watched),
    });
  }

  private logWatchEvent(
    watched: WatchedProposal,
    watcherKind: "content" | "location",
    path: string,
    eventType: WatchEventType,
    filename: string | null
  ): void {
    logger.debug("[proposal-status] watcher event", {
      ...this.logContext(watched),
      watcherKind,
      path,
      eventType,
      filename,
      watcherCount: this.watcherCount(watched),
    });
  }

  private logWatcherReleased(
    watched: WatchedProposal,
    watcherKind: "content" | "location",
    path: string,
    reason: string
  ): void {
    logger.info("[proposal-status] watcher released", {
      ...this.logContext(watched),
      watcherKind,
      path,
      reason,
      remainingWatcherCount: this.watcherCount(watched),
    });
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
    event: Pick<ProposalStatusChangedPayload, "status" | "changeKind"> &
      Partial<Pick<ProposalStatusChangedPayload, "removed">>
  ): void {
    this.emit({
      workspaceId: watched.workspaceId,
      proposalRef: watched.proposalRef,
      sessionId,
      status: event.status,
      changeKind: event.changeKind,
      updatedAt: new Date().toISOString(),
      ...(event.removed ? { removed: true } : {}),
    });
  }

  private emitForAllSessions(
    watched: WatchedProposal,
    event: Pick<ProposalStatusChangedPayload, "status" | "changeKind"> &
      Partial<Pick<ProposalStatusChangedPayload, "removed">>
  ): void {
    for (const sessionId of watched.sessionIds) this.emitForSession(watched, sessionId, event);
  }

  private watchKey(workspaceId: string, proposalRef: ProposalRef): string {
    return `${workspaceId}::${proposalRefKey(proposalRef)}`;
  }
}

export const proposalStatusService = new ProposalStatusService();
