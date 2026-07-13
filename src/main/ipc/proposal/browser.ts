import { ipcMain } from "electron";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import {
  getProposalSpecDeltasInputSchema,
  listProposalsInputSchema,
  readProposalFileInputSchema,
  watchProposalInputSchema,
} from "@shared/ipc/proposal/browser.schemas";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import { ipcError } from "../_kit/errors";
import {
  getProposalSpecDeltas,
  listProposals,
  readProposalFile,
} from "@main/services/proposal/browser/proposal-service";
import { proposalStatusService } from "@main/services/proposal/browser/proposal-status-service";
import { loadProject } from "@main/infra/storage/project-store";
import type { ProjectWindowManager } from "@main/bootstrap/project-window-manager";

// 状态广播依赖 ProjectWindowManager 按 projectId fanout；延迟订阅保证 service 初始化顺序无关。
let proposalStatusBroadcastManager: ProjectWindowManager | null = null;
let proposalStatusBroadcastSubscribed = false;

export function setupProposalStatusBroadcast(manager: ProjectWindowManager): void {
  proposalStatusBroadcastManager = manager;
  if (proposalStatusBroadcastSubscribed) {
    return;
  }

  proposalStatusService.onStatusChanged((payload) => {
    proposalStatusBroadcastManager?.sendToProject(
      payload.projectId,
      ProposalBrowserChannels.statusChanged,
      payload
    );
  });
  proposalStatusBroadcastSubscribed = true;
}

export function registerProposalHandlers(): void {
  ipcMain.handle(ProposalBrowserChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId } = validate(listProposalsInputSchema, input);
      return listProposals(projectId);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.readFile, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId, filename } = validate(readProposalFileInputSchema, input);
      return readProposalFile(projectId, changeId, filename);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.getSpecDeltas, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId } = validate(getProposalSpecDeltasInputSchema, input);
      return getProposalSpecDeltas(projectId, changeId);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.watch, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId, sessionId } = validate(watchProposalInputSchema, input);
      const project = await loadProject(projectId);
      if (!project) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
      }
      proposalStatusService.watchProposal(projectId, project.path, changeId, sessionId);
    })
  );
}
