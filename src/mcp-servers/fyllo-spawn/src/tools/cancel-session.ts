import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  cancelSessionParamsSchema,
  cancelSessionResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerCancelSessionTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "cancel_session",
    {
      description:
        "Request cancellation of a running spawned Session owned by the current parent Session. Params: sessionId of the spawned Session to cancel. Returns { cancelled: true } once the cancellation request has been triggered; this does NOT mean the ACP turn has confirmed cancellation. Cancellation is asynchronous and best-effort: the turn may keep running for a few seconds before it terminates, and the Session then transitions to a terminal error state (code TURN_CANCELLED_BY_PARENT) that cannot be reused. Always confirm the final state with check_session_status after cancelling. If the Session is not currently running (unknown, already finished, or owned by another parent), returns { cancelled: false, reason: 'Session not found' } without performing any action.",
      inputSchema: cancelSessionParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "cancel_session",
            caller: callerFromContext(),
            params: input,
            resultSchema: cancelSessionResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
