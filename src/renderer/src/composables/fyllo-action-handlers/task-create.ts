import type { TaskItem } from "@shared/types/task";
import type { IpcResponse } from "@shared/types/ipc";
import type { CreateSessionTaskInput, LineageTaskRef } from "@shared/types/lineage";
import type { FylloActionDispatchHandler } from "./types";
import { requireProjectId, requireSessionId } from "./types";

interface TaskCreateActionHandlerDependencies {
  createSessionTask: (
    projectId: string,
    input: CreateSessionTaskInput
  ) => Promise<IpcResponse<TaskItem>>;
  setSessionOriginTaskRef: (sessionId: string, originTaskRef: LineageTaskRef) => void;
}

export function createTaskCreateActionHandler(
  dependencies: TaskCreateActionHandlerDependencies
): FylloActionDispatchHandler<"task.create"> {
  return async (payload, runtime) => {
    const projectId = requireProjectId(runtime.projectId);
    if (typeof projectId !== "string") {
      return projectId;
    }

    const sessionId = requireSessionId(
      runtime.context,
      "当前聊天会话缺少 sessionId，无法创建任务。"
    );
    if (typeof sessionId !== "string") {
      return sessionId;
    }

    const result = await dependencies.createSessionTask(projectId, {
      sessionId,
      title: payload.title,
      description: payload.description,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    dependencies.setSessionOriginTaskRef(sessionId, `local:${result.data.id}`);

    return { outcome: "succeeded" };
  };
}
