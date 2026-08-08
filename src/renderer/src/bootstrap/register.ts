import { registerAcpAgentsTask } from "./tasks/acp-agents";
import { registerWorkspacesTask } from "./tasks/workspaces";
import { registerSpawnNotificationsTask } from "./tasks/spawn-notifications";

let registered = false;

export function registerBootstrapTasks(): void {
  if (registered) {
    return;
  }

  registerAcpAgentsTask();
  registerWorkspacesTask();
  registerSpawnNotificationsTask();
  registered = true;
}
