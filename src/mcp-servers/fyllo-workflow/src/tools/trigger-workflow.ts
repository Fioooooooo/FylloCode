import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { triggerWorkflowParamsSchema, triggerWorkflowResultSchema } from "../rpc-schema";
import { WorkflowRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerTriggerWorkflowTool(server: McpServer, rpc: WorkflowRpcClient): void {
  server.registerTool(
    "trigger_workflow",
    {
      description:
        "Accept a trusted Chat request to start one saved v2 Workflow. The result reports acceptance or a structured rejection; it does not wait for stages to finish.",
      inputSchema: triggerWorkflowParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "trigger_workflow",
            caller: callerFromContext(),
            params: input,
            resultSchema: triggerWorkflowResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
