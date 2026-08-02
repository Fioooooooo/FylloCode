import type { WebContents } from "electron";
import { workspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "./errors";

export function requireWorkspaceSender(sender: WebContents, workspaceId: string): void {
  const context = workspaceWindowManager.getContextByWebContents(sender);
  if (!context || context.role !== "workspace" || context.workspaceId !== workspaceId) {
    throw ipcError(
      IpcErrorCodes.WORKSPACE_NOT_FOUND,
      "Sender window does not belong to the specified Workspace"
    );
  }
}
