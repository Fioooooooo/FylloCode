import { registerChatHandlers } from "./chat";
import { registerSessionActionHandlers } from "./action";

export function registerSessionIpcHandlers(): void {
  registerChatHandlers();
  registerSessionActionHandlers();
}
