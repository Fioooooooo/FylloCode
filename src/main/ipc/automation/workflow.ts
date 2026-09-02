import { ipcMain } from "electron";
import { AutomationWorkflowChannels } from "@shared/ipc/automation/workflow.channels";
import {
  deleteWorkflowInputSchema,
  listWorkflowsInputSchema,
  saveWorkflowInputSchema,
} from "@shared/ipc/automation/workflow.schemas";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import {
  deleteWorkflowDefinition,
  listWorkflowDefinitions,
  loadWorkflowDefinition,
  saveWorkflowDefinition,
} from "@main/services/automation/workflow/workflow-service";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import { requireWorkspaceSender } from "../_kit/workspace-scope";

async function assertWorkflowOwner(workspaceId: string, workflowId?: string): Promise<void> {
  await getRequiredWorkspaceInfo(workspaceId);
  if (!workflowId) return;
  const workflow = await loadWorkflowDefinition(workspaceId, workflowId);
  if (!workflow) {
    throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${workflowId}`);
  }
}

export function registerWorkflowHandlers(): void {
  ipcMain.handle(AutomationWorkflowChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(listWorkflowsInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowOwner(request.workspaceId);
      return listWorkflowDefinitions(request.workspaceId);
    })
  );

  ipcMain.handle(AutomationWorkflowChannels.save, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(saveWorkflowInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowOwner(request.workspaceId, request.workflowId);
      return saveWorkflowDefinition(request);
    })
  );

  ipcMain.handle(AutomationWorkflowChannels.delete, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(deleteWorkflowInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowOwner(request.workspaceId, request.workflowId);
      return deleteWorkflowDefinition(request);
    })
  );
}
