import { registerAcpAgentsTask } from "./tasks/acp-agents";
import { registerProjectsTask } from "./tasks/projects";

let registered = false;

export function registerBootstrapTasks(): void {
  if (registered) {
    return;
  }

  registerAcpAgentsTask();
  registerProjectsTask();
  registered = true;
}
