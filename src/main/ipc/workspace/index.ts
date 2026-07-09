import { registerProjectHandlers } from "./project";
import { registerWindowHandlers } from "./window";

export function registerWorkspaceIpcHandlers(): void {
  registerWindowHandlers();
  registerProjectHandlers();
}
