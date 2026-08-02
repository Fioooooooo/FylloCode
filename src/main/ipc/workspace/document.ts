import { ipcMain, type WebContents } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import {
  confirmLocalFilePreviewInputSchema,
  prepareLocalFilePreviewInputSchema,
} from "@shared/ipc/workspace/document.schemas";
import type { LocalFilePreviewResult } from "@shared/types/local-file-preview";
import {
  workspaceWindowManager,
  type WorkspaceWindowManager,
} from "@main/bootstrap/workspace-window-manager";
import {
  localFilePreviewService,
  type LocalFilePreviewService,
} from "@main/services/workspace/document/local-file-preview-service";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { ipcError } from "../_kit/errors";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

interface DocumentHandlerDependencies {
  manager?: WorkspaceWindowManager;
  service?: LocalFilePreviewService;
}

function getWorkspaceContext(
  manager: WorkspaceWindowManager,
  sender: WebContents
): {
  workspaceId: string;
} {
  const context = manager.getContextByWebContents(sender);
  if (context?.role !== "workspace") {
    throw ipcError(IpcErrorCodes.WORKSPACE_REQUIRED, "本地文件预览需要 Workspace 窗口");
  }
  return { workspaceId: context.workspaceId };
}

export function registerDocumentHandlers(dependencies: DocumentHandlerDependencies = {}): void {
  const manager = dependencies.manager ?? workspaceWindowManager;
  const service = dependencies.service ?? localFilePreviewService;

  ipcMain.handle(WorkspaceDocumentChannels.preparePreview, (event, input: unknown) =>
    wrapHandler(async (): Promise<LocalFilePreviewResult> => {
      const form = validate(prepareLocalFilePreviewInputSchema, input);
      const { workspaceId } = getWorkspaceContext(manager, event.sender);
      const workspace = await resolveWorkspace(workspaceId);
      return service.preparePreview(form, {
        workspaceId,
        folderPath: workspace.cwd,
        sender: event.sender,
      });
    })
  );

  ipcMain.handle(WorkspaceDocumentChannels.confirmPreview, (event, input: unknown) =>
    wrapHandler(async (): Promise<LocalFilePreviewResult> => {
      const form = validate(confirmLocalFilePreviewInputSchema, input);
      const { workspaceId } = getWorkspaceContext(manager, event.sender);
      const workspace = await resolveWorkspace(workspaceId);
      return service.confirmPreview(form, {
        workspaceId,
        folderPath: workspace.cwd,
        sender: event.sender,
      });
    })
  );
}
