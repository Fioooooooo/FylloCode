import { registerDocumentHandlers } from "./document";
import { registerWorkspaceHandlers } from "./workspace";
import { registerWindowHandlers } from "./window";

export function registerWorkspaceIpcHandlers(): void {
  registerDocumentHandlers();
  registerWindowHandlers();
  registerWorkspaceHandlers();
}
