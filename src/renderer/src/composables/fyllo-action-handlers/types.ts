import type {
  FylloActionHandlerResult,
  FylloActionPayloadByType,
  FylloActionType,
} from "@shared/types/fyllo-action";

export interface FylloActionDispatchContext {
  sessionId?: string | null;
}

export interface FylloActionHandlerRuntime {
  projectId?: string;
  context: FylloActionDispatchContext;
}

export type FylloActionDispatchHandler<Type extends FylloActionType> = (
  payload: FylloActionPayloadByType[Type],
  runtime: FylloActionHandlerRuntime
) => Promise<FylloActionHandlerResult>;

export type FylloActionDispatchHandlerMap = {
  [Type in FylloActionType]: FylloActionDispatchHandler<Type>;
};

export function requireProjectId(projectId: string | undefined): string | FylloActionHandlerResult {
  if (!projectId) {
    return {
      outcome: "failed",
      error: "当前没有选中的项目",
    };
  }

  return projectId;
}

export function requireSessionId(
  context: FylloActionDispatchContext,
  error: string
): string | FylloActionHandlerResult {
  const sessionId = context.sessionId?.trim();
  if (!sessionId) {
    return {
      outcome: "failed",
      error,
    };
  }

  return sessionId;
}
