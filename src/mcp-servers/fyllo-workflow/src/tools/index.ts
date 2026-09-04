import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WorkflowRpcClient } from "../rpc-client";
import { registerDescribeWorkflowSchemaTool } from "./describe-workflow-schema";
import { registerListWorkflowsTool } from "./list-workflows";
import { registerProposeWorkflowTool } from "./propose-workflow";
import { registerTriggerWorkflowTool } from "./trigger-workflow";

export function registerTools(server: McpServer, rpc: WorkflowRpcClient): void {
  registerListWorkflowsTool(server, rpc);
  registerTriggerWorkflowTool(server, rpc);
  registerDescribeWorkflowSchemaTool(server, rpc);
  registerProposeWorkflowTool(server, rpc);
}
