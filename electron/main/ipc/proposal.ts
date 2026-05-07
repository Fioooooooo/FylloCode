import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import {
  listProposalsInputSchema,
  readProposalFileInputSchema,
} from "@shared/schemas/ipc/proposal";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { listProposals, readProposalFile } from "@main/services/proposal/proposal-service";

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
}
