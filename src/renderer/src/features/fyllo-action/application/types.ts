import type {
  FylloActionHandlerResult,
  FylloActionPayloadByType,
  FylloActionType,
} from "@shared/fyllo-action/protocol";

export interface FylloActionDispatchContext {
  workspaceId: string;
  sessionId: string;
  actionId: string;
}

export interface FylloActionHandlerRuntime {
  context: FylloActionDispatchContext;
}

export type FylloActionDispatchHandler<Type extends FylloActionType> = (
  payload: FylloActionPayloadByType[Type],
  runtime: FylloActionHandlerRuntime
) => Promise<FylloActionHandlerResult>;

export type FylloActionDispatchHandlerMap = {
  [Type in FylloActionType]: FylloActionDispatchHandler<Type>;
};
