import type { IpcResponse } from "@shared/types/ipc";
import type { WorkspaceInfo } from "@shared/types/workspace";

export const workspaceApi = {
  list(): Promise<IpcResponse<WorkspaceInfo[]>> {
    return window.api.workspace.workspace.list();
  },

  getById(id: string): Promise<IpcResponse<WorkspaceInfo | null>> {
    return window.api.workspace.workspace.getById(id);
  },

  update(
    id: string,
    patch: { name?: string; healthScore?: number }
  ): Promise<IpcResponse<WorkspaceInfo>> {
    return window.api.workspace.workspace.update(id, patch);
  },

  remove(id: string): Promise<IpcResponse<void>> {
    return window.api.workspace.workspace.remove(id);
  },
};
