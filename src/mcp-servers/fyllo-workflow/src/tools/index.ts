import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WorkflowRpcClient } from "../rpc-client";
import { registerListWorkflowsTool } from "./list-workflows";
import { registerTriggerWorkflowTool } from "./trigger-workflow";

export function registerTools(server: McpServer, rpc: WorkflowRpcClient): void {
  registerListWorkflowsTool(server, rpc);
  registerTriggerWorkflowTool(server, rpc);
}
