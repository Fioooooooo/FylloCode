import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readResponseParamsSchema, readResponseResultSchema } from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerReadResponseTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "read_response",
    {
      description:
        "Read the next bounded chunk of a completed spawned response using its responseId and opaque cursor.",
      inputSchema: readResponseParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "read_response",
            caller: callerFromContext(),
            params: input,
            resultSchema: readResponseResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
