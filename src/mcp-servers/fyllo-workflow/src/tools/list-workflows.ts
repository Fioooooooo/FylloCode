import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listWorkflowsParamsSchema, listWorkflowsResultSchema } from "../rpc-schema";
import { WorkflowRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerListWorkflowsTool(server: McpServer, rpc: WorkflowRpcClient): void {
  server.registerTool(
    "list_workflows",
    {
      description:
        "List the latest v2 workflows saved in the current trusted Workspace. This is read-only and does not create a Run.",
      inputSchema: listWorkflowsParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "list_workflows",
            caller: callerFromContext(),
            params: input,
            resultSchema: listWorkflowsResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
