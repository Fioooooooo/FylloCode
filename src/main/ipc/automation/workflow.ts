import { ipcMain } from "electron";
import { AutomationWorkflowChannels } from "@shared/ipc/automation/workflow.channels";
import {
  deleteWorkflowInputSchema,
  listWorkflowsInputSchema,
  saveWorkflowInputSchema,
} from "@shared/ipc/automation/workflow.schemas";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import {
  deleteWorkflow,
  listWorkflows,
  saveWorkflow,
} from "@main/services/automation/workflow/workflow-service";

export function registerWorkflowHandlers(): void {
  ipcMain.handle(AutomationWorkflowChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(listWorkflowsInputSchema, input);
      return listWorkflows(request.projectId);
    })
  );

  ipcMain.handle(AutomationWorkflowChannels.save, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(saveWorkflowInputSchema, input);
      await saveWorkflow(request);
    })
  );

  ipcMain.handle(AutomationWorkflowChannels.delete, (_event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(deleteWorkflowInputSchema, input);
      await deleteWorkflow(request);
    })
  );
}
