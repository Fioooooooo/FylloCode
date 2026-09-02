import { registerAcpAgentsTask } from "./tasks/acp-agents";
import { registerWorkspacesTask } from "./tasks/workspaces";
import { registerSpawnNotificationsTask } from "./tasks/spawn-notifications";
import { registerSpawnedSessionsTask } from "./tasks/spawned-sessions";
import { registerWorkflowRunsTask } from "./tasks/workflow-runs";

let registered = false;

export function registerBootstrapTasks(): void {
  if (registered) {
    return;
  }

  registerAcpAgentsTask();
  registerWorkspacesTask();
  registerSpawnNotificationsTask();
  registerSpawnedSessionsTask();
  registerWorkflowRunsTask();
  registered = true;
}
