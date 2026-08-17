import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  promptToAgentParamsSchema,
  promptToAgentResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerPromptToAgentTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "prompt_to_agent",
    {
      description:
        "Delegate one focused task to an installed ACP Agent, or continue a spawned Session. RECOMMENDED: use the default background mode (background=true). The call returns 'accepted' as soon as Main has durably accepted and dispatched the turn; emit the spawn.session Signal immediately after that accepted result, then keep working or report progress to the user while the spawned Agent runs, e.g. poll in a loop: check_session_status(sessionId) -> if running, tell the user what the spawned Agent is doing and poll again -> once idle, read the result with responseId + read_response. Background mode keeps both Agents observable in parallel and suits long or complex delegated tasks; background turns have no absolute runtime limit, but remain subject to inactivity cancellation and active-turn capacity. Only pass background=false for simple, fast tasks (under ~30 seconds) where you have no other work and intentionally block until the result; note that in sync mode you cannot emit anything while blocked, so the spawn.session Signal only appears after the task completes, which hides progress from the user. When a call omits sessionId and its result contains the newly created Session identity, follow the injected spawn.session Signal contract once for either synchronous or background creation; do not repeat it for continuation calls. Split parallel work into non-overlapping file scopes because spawned Agents share the parent Workspace directories.",
      inputSchema: promptToAgentParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "prompt_to_agent",
            caller: callerFromContext(),
            params: input,
            resultSchema: promptToAgentResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
