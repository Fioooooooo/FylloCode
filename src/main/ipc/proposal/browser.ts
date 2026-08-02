import { ipcMain } from "electron";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import {
  getProposalSpecDeltasInputSchema,
  listProposalsInputSchema,
  readProposalFileInputSchema,
  watchProposalInputSchema,
} from "@shared/ipc/proposal/browser.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import {
  getProposalSpecDeltas,
  listProposals,
  readProposalFile,
} from "@main/services/proposal/browser/proposal-service";
import { proposalStatusService } from "@main/services/proposal/browser/proposal-status-service";
import { resolveWorkspace } from "@main/services/workspace/resolver/workspace-resolver";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";

// 状态广播依赖 WorkspaceWindowManager 按 workspaceId fanout；延迟订阅保证 service 初始化顺序无关。
let proposalStatusBroadcastManager: WorkspaceWindowManager | null = null;
let proposalStatusBroadcastSubscribed = false;

export function setupProposalStatusBroadcast(manager: WorkspaceWindowManager): void {
  proposalStatusBroadcastManager = manager;
  if (proposalStatusBroadcastSubscribed) {
    return;
  }

  proposalStatusService.onStatusChanged((payload) => {
    proposalStatusBroadcastManager?.sendToWorkspace(
      payload.workspaceId,
      ProposalBrowserChannels.statusChanged,
      payload
    );
  });
  proposalStatusBroadcastSubscribed = true;
}

export function registerProposalHandlers(): void {
  ipcMain.handle(ProposalBrowserChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(listProposalsInputSchema, input);
      return listProposals(workspaceId);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.readFile, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, changeId, filename } = validate(readProposalFileInputSchema, input);
      return readProposalFile(workspaceId, changeId, filename);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.getSpecDeltas, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, changeId } = validate(getProposalSpecDeltasInputSchema, input);
      return getProposalSpecDeltas(workspaceId, changeId);
    })
  );

  ipcMain.handle(ProposalBrowserChannels.watch, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId, changeId, sessionId } = validate(watchProposalInputSchema, input);
      const workspace = await resolveWorkspace(workspaceId);
      proposalStatusService.watchProposal(workspaceId, workspace.cwd, changeId, sessionId);
    })
  );
}
