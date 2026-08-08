export const SPAWN_APP_RESTARTED_MESSAGE =
  "FylloCode restarted while the spawned turn was still running. The turn was interrupted and cannot be resumed. If the task is still needed, call prompt_to_agent again without sessionId and restate the task.";

export const SPAWN_APP_SHUTDOWN_MESSAGE =
  "FylloCode shut down while the spawned turn was still running. The turn was interrupted and cannot be resumed. If the task is still needed, call prompt_to_agent again without sessionId and restate the task.";

export const SPAWN_ACTIVE_PROCESS_INVALIDATED_MESSAGE =
  "The Agent process became unavailable while the spawned turn was running. The turn cannot continue, and this spawned Session cannot be reused. If the task is still needed, call prompt_to_agent again without sessionId and restate the task.";

export const SPAWN_COMPLETED_PROCESS_INVALIDATED_MESSAGE =
  "This spawned Session can no longer accept new turns because its Agent process is unavailable. The completed result remains readable if you already have its responseId. Call prompt_to_agent again without sessionId for further work.";

export const SPAWN_PROCESS_INVALIDATED_FALLBACK_MESSAGE =
  "This spawned Session can no longer be reused because its Agent process is unavailable. Do not retry with this sessionId; call prompt_to_agent again without sessionId if further work is needed.";
