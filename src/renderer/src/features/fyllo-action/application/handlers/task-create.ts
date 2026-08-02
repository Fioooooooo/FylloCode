import type { TaskItem } from "@shared/types/task";
import type { IpcResponse } from "@shared/types/ipc";
import type { CreateSessionTaskInput, LineageTaskRef } from "@shared/types/lineage";
import type { FylloActionDispatchHandler } from "../types";

interface TaskCreateActionHandlerDependencies {
  createSessionTask: (
    workspaceId: string,
    input: CreateSessionTaskInput
  ) => Promise<IpcResponse<TaskItem>>;
  setSessionOriginTaskRef: (sessionId: string, originTaskRef: LineageTaskRef) => void;
}

export function createTaskCreateActionHandler(
  dependencies: TaskCreateActionHandlerDependencies
): FylloActionDispatchHandler<"task.create"> {
  return async (payload, runtime) => {
    const { workspaceId, sessionId, actionId } = runtime.context;

    const result = await dependencies.createSessionTask(workspaceId, {
      sessionId,
      title: payload.title,
      description: payload.description,
      actionId,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    dependencies.setSessionOriginTaskRef(sessionId, `local:${result.data.id}`);

    return { outcome: "succeeded" };
  };
}
