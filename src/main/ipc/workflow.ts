import { ipcMain } from "electron";
import { WorkflowChannels } from "@shared/types/channels";
import {
  deleteWorkflowInputSchema,
  listWorkflowsInputSchema,
  saveWorkflowInputSchema,
} from "@shared/schemas/ipc/workflow";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import {
  deleteWorkflow,
  listWorkflows,
  saveWorkflow,
} from "@main/services/workflow/workflow-service";

export function registerWorkflowHandlers(): void {
  ipcMain.handle(WorkflowChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(listWorkflowsInputSchema, input);
      return listWorkflows(request.projectId);
    })
  );

  ipcMain.handle(WorkflowChannels.save, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(saveWorkflowInputSchema, input);
      await saveWorkflow(request);
    })
  );

  ipcMain.handle(WorkflowChannels.delete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(deleteWorkflowInputSchema, input);
      await deleteWorkflow(request);
    })
  );
}
