import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  describeWorkflowSchemaParamsSchema,
  describeWorkflowSchemaResultSchema,
} from "../rpc-schema";
import { WorkflowRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerDescribeWorkflowSchemaTool(
  server: McpServer,
  rpc: WorkflowRpcClient
): void {
  server.registerTool(
    "describe_workflow_schema",
    {
      description:
        "Describe the workflow YAML schema on demand. This is a read-only query and does not create or change a proposal, definition, or Run. Call with withExamples=true when a complete YAML example is needed.",
      inputSchema: describeWorkflowSchemaParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "describe_workflow_schema",
            caller: callerFromContext(),
            params: { withExamples: input.withExamples ?? false },
            resultSchema: describeWorkflowSchemaResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
