import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpawnRpcClient } from "../rpc-client";
import { registerAvailableAgentsTool } from "./available-agents";
import { registerPromptToAgentTool } from "./prompt-to-agent";
import { registerCheckSessionStatusTool } from "./check-session-status";
import { registerReadResponseTool } from "./read-response";
import { registerCancelSessionTool } from "./cancel-session";

export function registerTools(server: McpServer, rpc: SpawnRpcClient): void {
  registerAvailableAgentsTool(server, rpc);
  registerPromptToAgentTool(server, rpc);
  registerCheckSessionStatusTool(server, rpc);
  registerReadResponseTool(server, rpc);
  registerCancelSessionTool(server, rpc);
}
