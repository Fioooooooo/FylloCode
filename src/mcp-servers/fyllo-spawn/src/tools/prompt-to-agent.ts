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
        "Delegate one focused task to an installed ACP Agent, or continue a spawned Session. When a call omits sessionId and its result contains the newly created Session identity, follow the injected spawn.session Signal contract once for either synchronous or background creation; do not repeat it for continuation calls. Set background=true to return once Main has durably accepted and dispatched the turn; poll check_session_status and read the completed result with responseId + read_response. Background turns have no absolute runtime limit, but remain subject to inactivity cancellation and active-turn capacity. Split parallel work into non-overlapping file scopes because spawned Agents share the parent Workspace directories.",
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
