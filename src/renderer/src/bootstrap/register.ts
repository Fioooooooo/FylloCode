import { registerAcpAgentsTask } from "./tasks/acp-agents";
import { registerWorkspacesTask } from "./tasks/workspaces";

let registered = false;

export function registerBootstrapTasks(): void {
  if (registered) {
    return;
  }

  registerAcpAgentsTask();
  registerWorkspacesTask();
  registered = true;
}
