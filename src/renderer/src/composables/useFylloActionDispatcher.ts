import { lineageApi } from "@renderer/api/lineage";
import { useProjectStore } from "@renderer/stores/project";
import type {
  FylloActionHandlerResult,
  FylloActionPayloadByType,
  FylloActionType,
} from "@shared/types/fyllo-action";

interface FylloActionDispatchContext {
  sessionId?: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useFylloActionDispatcher(): {
  dispatchFylloAction: <Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context?: FylloActionDispatchContext
  ) => Promise<FylloActionHandlerResult>;
} {
  const projectStore = useProjectStore();

  async function dispatchFylloAction<Type extends FylloActionType>(
    type: Type,
    payload: FylloActionPayloadByType[Type],
    context: FylloActionDispatchContext = {}
  ): Promise<FylloActionHandlerResult> {
    try {
      if (type === "task.create") {
        const taskPayload = payload as FylloActionPayloadByType["task.create"];
        const projectId = projectStore.currentProject?.id;
        if (!projectId) {
          return {
            ok: false,
            error: "当前没有选中的项目",
          };
        }

        const sessionId = context.sessionId?.trim();
        if (!sessionId) {
          return {
            ok: false,
            error: "当前聊天会话缺少 sessionId，无法创建任务。",
          };
        }

        const result = await lineageApi.createSessionTask(projectId, {
          sessionId,
          title: taskPayload.title,
          description: taskPayload.description,
        });
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        return { ok: true };
      }

      return {
        ok: false,
        error: "Unsupported Fyllo action type.",
      };
    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
      };
    }
  }

  return {
    dispatchFylloAction,
  };
}
