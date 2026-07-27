import { ipcMain, type WebContents } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { WorkspaceDocumentChannels } from "@shared/ipc/workspace/document.channels";
import {
  confirmLocalFilePreviewInputSchema,
  prepareLocalFilePreviewInputSchema,
} from "@shared/ipc/workspace/document.schemas";
import type { LocalFilePreviewResult } from "@shared/types/local-file-preview";
import {
  projectWindowManager,
  type ProjectWindowManager,
} from "@main/bootstrap/project-window-manager";
import {
  localFilePreviewService,
  type LocalFilePreviewService,
} from "@main/services/workspace/document/local-file-preview-service";
import { getRequiredProject } from "@main/services/workspace/project/project-service";
import { ipcError } from "../_kit/errors";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

interface DocumentHandlerDependencies {
  manager?: ProjectWindowManager;
  service?: LocalFilePreviewService;
}

function getProjectContext(
  manager: ProjectWindowManager,
  sender: WebContents
): {
  projectId: string;
} {
  const context = manager.getContextByWebContents(sender);
  if (context?.role !== "project") {
    throw ipcError(IpcErrorCodes.PROJECT_REQUIRED, "本地文件预览需要项目窗口");
  }
  return { projectId: context.projectId };
}

export function registerDocumentHandlers(dependencies: DocumentHandlerDependencies = {}): void {
  const manager = dependencies.manager ?? projectWindowManager;
  const service = dependencies.service ?? localFilePreviewService;

  ipcMain.handle(WorkspaceDocumentChannels.preparePreview, (event, input: unknown) =>
    wrapHandler(async (): Promise<LocalFilePreviewResult> => {
      const form = validate(prepareLocalFilePreviewInputSchema, input);
      const { projectId } = getProjectContext(manager, event.sender);
      const project = await getRequiredProject(projectId);
      return service.preparePreview(form, {
        projectId,
        projectPath: project.path,
        sender: event.sender,
      });
    })
  );

  ipcMain.handle(WorkspaceDocumentChannels.confirmPreview, (event, input: unknown) =>
    wrapHandler(async (): Promise<LocalFilePreviewResult> => {
      const form = validate(confirmLocalFilePreviewInputSchema, input);
      const { projectId } = getProjectContext(manager, event.sender);
      const project = await getRequiredProject(projectId);
      return service.confirmPreview(form, {
        projectId,
        projectPath: project.path,
        sender: event.sender,
      });
    })
  );
}
