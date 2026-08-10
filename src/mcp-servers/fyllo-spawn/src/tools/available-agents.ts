import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  availableAgentsParamsSchema,
  availableAgentsResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerAvailableAgentsTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "available_agents",
    {
      description:
        "List installed ACP Agents available for delegated work. This is read-only and does not start an Agent process.",
      inputSchema: availableAgentsParamsSchema,
    },
    async (_input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "available_agents",
            caller: callerFromContext(),
            params: {},
            resultSchema: availableAgentsResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
