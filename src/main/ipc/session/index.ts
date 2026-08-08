import { registerChatHandlers } from "./chat";
import { registerSessionActionHandlers } from "./action";
import { registerSpawnedSessionHandlers } from "./spawned-session";

export function registerSessionIpcHandlers(): void {
  registerChatHandlers();
  registerSessionActionHandlers();
  registerSpawnedSessionHandlers();
}
