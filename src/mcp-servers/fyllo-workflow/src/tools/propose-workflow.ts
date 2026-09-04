import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { proposeWorkflowParamsSchema, proposeWorkflowResultSchema } from "../rpc-schema";
import { WorkflowRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerProposeWorkflowTool(server: McpServer, rpc: WorkflowRpcClient): void {
  server.registerTool(
    "propose_workflow",
    {
      description:
        "Submit a generated or updated workflow YAML for user review. Call describe_workflow_schema first if you have not already. Field rules: mode=create creates a new workflow and MUST omit workflowId; mode=update revises an existing workflow and MUST include workflowId. persist is an Agent-suggested scope (session shadow or reusable workspace definition); the user's confirmation choice is final. The proposal is session-owned, does not create a Run, and is not saved as a reusable definition until the user confirms it.",
      inputSchema: proposeWorkflowParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "propose_workflow",
            caller: callerFromContext(),
            params: input,
            resultSchema: proposeWorkflowResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
