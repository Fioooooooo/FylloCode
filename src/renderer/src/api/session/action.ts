import type { IpcResponse } from "@shared/types/ipc";
import type {
  RegisterActionInput,
  TransitionActionInput,
  TransitionActionsInput,
} from "@shared/ipc/session/action.schemas";
import type { FylloActionState, TransitionFylloActionResult } from "@shared/fyllo-action/protocol";

export const sessionActionApi = {
  registerAction(input: RegisterActionInput): Promise<IpcResponse<FylloActionState>> {
    return window.api.session.action.registerAction(input);
  },

  transitionAction(input: TransitionActionInput): Promise<IpcResponse<FylloActionState>> {
    return window.api.session.action.transitionAction(input);
  },

  transitionActions(
    input: TransitionActionsInput
  ): Promise<IpcResponse<TransitionFylloActionResult[]>> {
    return window.api.session.action.transitionActions(input);
  },
};
