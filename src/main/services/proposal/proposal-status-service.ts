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
  projectPath: string;
  sessionId: string;
  changeId: string;
  currentStatus: ProposalStatus;
  watchedPath: string;
}

class ProposalStatusService {
  private readonly watches = new Map<string, WatchedProposal>();
  private readonly listeners = new Set<(payload: ProposalStatusChangedPayload) => void>();

  watchProposal(projectPath: string, changeId: string, sessionId: string): void {
    if (this.watches.has(changeId)) {
      this.unwatchProposal(changeId);
    }

    void this.startWatch(projectPath, changeId, sessionId);
  }

  private async startWatch(
    projectPath: string,
    changeId: string,
    sessionId: string
  ): Promise<void> {
    const resolved = await resolveChangeDirAnywhere(projectPath, changeId);
    if (!resolved) {
      this.emit({
        changeId,
        sessionId,
        projectPath,
        status: "draft",
        updatedAt: new Date().toISOString(),
        removed: true,
      });
      return;
    }

    const watchedPath = join(resolved.dir, ".openspec.yaml");
    const currentStatus = (await this.readStatus(watchedPath)) ?? "draft";

    const watcher = watch(watchedPath, () => {
      void this.handleWatchEvent(changeId);
    });
    watcher.on("error", (error: unknown) => {
      logger.warn(`[proposal-status] watcher error for ${changeId}`, error);
    });

    const watched: WatchedProposal = {
      watcher,
      projectPath,
      sessionId,
      changeId,
      currentStatus,
      watchedPath,
    };
    this.watches.set(changeId, watched);

    this.emit({
      changeId,
      sessionId,
      projectPath,
      status: currentStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  private async readStatus(watchedPath: string): Promise<ProposalStatus | null> {
    const content = await readIfExists(watchedPath);
    if (!content) {
      return null;
    }
    return parseYamlStatus(content);
  }

  private async handleWatchEvent(changeId: string): Promise<void> {
    const watched = this.watches.get(changeId);
    if (!watched) {
      return;
    }

    let status = await this.readStatus(watched.watchedPath);
    if (status !== null) {
      if (status !== watched.currentStatus) {
        watched.currentStatus = status;
        this.emit({
          changeId: watched.changeId,
          sessionId: watched.sessionId,
          projectPath: watched.projectPath,
          status,
          updatedAt: new Date().toISOString(),
        });
      }
      return;
    }

    const resolved = await resolveChangeDirAnywhere(watched.projectPath, changeId);
    if (!resolved) {
      this.emit({
        changeId: watched.changeId,
        sessionId: watched.sessionId,
        projectPath: watched.projectPath,
        status: watched.currentStatus,
        updatedAt: new Date().toISOString(),
        removed: true,
      });
      this.unwatchProposal(changeId);
      return;
    }

    const newWatchedPath = join(resolved.dir, ".openspec.yaml");
    status = (await this.readStatus(newWatchedPath)) ?? "draft";

    watched.watcher.close();
    const newWatcher = watch(newWatchedPath, () => {
      void this.handleWatchEvent(changeId);
    });
    newWatcher.on("error", (error: unknown) => {
      logger.warn(`[proposal-status] watcher error for ${changeId}`, error);
    });
    watched.watcher = newWatcher;
    watched.watchedPath = newWatchedPath;

    if (status !== watched.currentStatus) {
      watched.currentStatus = status;
      this.emit({
        changeId: watched.changeId,
        sessionId: watched.sessionId,
        projectPath: watched.projectPath,
        status,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  unwatchProposal(changeId: string): void {
    const watched = this.watches.get(changeId);
    if (!watched) {
      return;
    }
    watched.watcher.close();
    this.watches.delete(changeId);
  }

  unwatchAll(): void {
    for (const [changeId] of this.watches) {
      this.unwatchProposal(changeId);
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
}

export const proposalStatusService = new ProposalStatusService();
