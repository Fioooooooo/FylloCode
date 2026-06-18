import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import {
  listProposalsInputSchema,
  readProposalFileInputSchema,
  watchProposalInputSchema,
} from "@shared/schemas/ipc/proposal";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { listProposals, readProposalFile } from "@main/services/proposal/proposal-service";
import { proposalStatusService } from "@main/services/proposal/proposal-status-service";
import { loadProject } from "@main/infra/storage/project-store";

let proposalStatusBroadcastWindow: BrowserWindow | null = null;
let proposalStatusBroadcastSubscribed = false;

export function setupProposalStatusBroadcast(mainWindow: BrowserWindow): void {
  proposalStatusBroadcastWindow = mainWindow;
  if (proposalStatusBroadcastSubscribed) {
    return;
  }

  proposalStatusService.onStatusChanged((payload) => {
    if (proposalStatusBroadcastWindow?.isDestroyed()) {
      return;
    }
    proposalStatusBroadcastWindow?.webContents.send(ProposalChannels.statusChanged, payload);
  });
  proposalStatusBroadcastSubscribed = true;
}

export function registerProposalHandlers(): void {
  ipcMain.handle(ProposalChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId } = validate(listProposalsInputSchema, input);
      return listProposals(projectId);
    })
  );

  ipcMain.handle(ProposalChannels.readFile, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId, filename } = validate(readProposalFileInputSchema, input);
      return readProposalFile(projectId, changeId, filename);
    })
  );

  ipcMain.handle(ProposalChannels.watch, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId, sessionId } = validate(watchProposalInputSchema, input);
      const project = await loadProject(projectId);
      if (!project) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
      }
      proposalStatusService.watchProposal(project.path, changeId, sessionId);
    })
  );
}
