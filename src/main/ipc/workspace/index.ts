import { registerDocumentHandlers } from "./document";
import { registerProjectHandlers } from "./project";
import { registerWindowHandlers } from "./window";

export function registerWorkspaceIpcHandlers(): void {
  registerDocumentHandlers();
  registerWindowHandlers();
  registerProjectHandlers();
}
