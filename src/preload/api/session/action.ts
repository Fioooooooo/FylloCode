import { ipcRenderer } from "electron";
import type { IpcResponse } from "@shared/types/ipc";
import { SessionActionChannels } from "@shared/ipc/session/action.channels";
import type {
  RegisterActionInput,
  TransitionActionInput,
  TransitionActionsInput,
} from "@shared/ipc/session/action.schemas";
import type { FylloActionState, TransitionFylloActionResult } from "@shared/fyllo-action/protocol";

export const sessionActionApi = {
  registerAction(input: RegisterActionInput): Promise<IpcResponse<FylloActionState>> {
    return ipcRenderer.invoke(SessionActionChannels.registerAction, input);
  },

  transitionAction(input: TransitionActionInput): Promise<IpcResponse<FylloActionState>> {
    return ipcRenderer.invoke(SessionActionChannels.transitionAction, input);
  },

  transitionActions(
    input: TransitionActionsInput
  ): Promise<IpcResponse<TransitionFylloActionResult[]>> {
    return ipcRenderer.invoke(SessionActionChannels.transitionActions, input);
  },
};
