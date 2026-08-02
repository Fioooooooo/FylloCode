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
import {
  assertSessionBelongsToWorkspace,
  ensureSessionWorkspaceSnapshot,
} from "@main/services/session/chat/chat-service";

interface DocumentHandlerDependencies {
  manager?: WorkspaceWindowManager;
  service?: LocalFilePreviewService;
}

async function assertSessionComparisonContext(
  workspaceId: string,
  sessionId: string | undefined
): Promise<void> {
  if (!sessionId) return;
  await assertSessionBelongsToWorkspace(workspaceId, sessionId);
}

async function attachAgentScope(
  result: LocalFilePreviewResult,
  workspaceId: string,
  sessionId: string | undefined
): Promise<LocalFilePreviewResult> {
  if (!sessionId || result.status !== "ready") {
    return result;
  }
  if (!result.document.owner) {
    return { ...result, agentScope: "window-only" };
  }

  const snapshot = await ensureSessionWorkspaceSnapshot(workspaceId, sessionId);
  const authorized = snapshot.folders.some(
    (folder) => folder.folderId === result.document.owner?.folderId
  );
  return { ...result, agentScope: authorized ? "authorized" : "window-only" };
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
      await assertSessionComparisonContext(workspaceId, form.sessionId);
      const workspace = await resolveWorkspace(workspaceId);
      const result = await service.preparePreview(form, {
        workspaceId,
        availableFolders: workspace.availableFolders,
        ...(form.sessionId ? { sessionId: form.sessionId } : {}),
        sender: event.sender,
      });
      return attachAgentScope(result, workspaceId, form.sessionId);
    })
  );

  ipcMain.handle(WorkspaceDocumentChannels.confirmPreview, (event, input: unknown) =>
    wrapHandler(async (): Promise<LocalFilePreviewResult> => {
      const form = validate(confirmLocalFilePreviewInputSchema, input);
      const { workspaceId } = getWorkspaceContext(manager, event.sender);
      await assertSessionComparisonContext(workspaceId, form.sessionId);
      const workspace = await resolveWorkspace(workspaceId);
      const result = await service.confirmPreview(form, {
        workspaceId,
        availableFolders: workspace.availableFolders,
        ...(form.sessionId ? { sessionId: form.sessionId } : {}),
        sender: event.sender,
      });
      return attachAgentScope(result, workspaceId, form.sessionId);
    })
  );
}
