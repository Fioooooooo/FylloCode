import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  checkSessionStatusParamsSchema,
  checkSessionStatusResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerCheckSessionStatusTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "check_session_status",
    {
      description:
        "Read a spawned Session status snapshot without waiting for an active prompt to finish.",
      inputSchema: checkSessionStatusParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "check_session_status",
            caller: callerFromContext(),
            params: input,
            resultSchema: checkSessionStatusResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
