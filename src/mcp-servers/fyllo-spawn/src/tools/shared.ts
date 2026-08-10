import type { SpawnCaller } from "@shared/types/fyllo-spawn-rpc";
import { getWorkspaceContext } from "../../../shared/workspace-context";
import { SpawnRpcClientError } from "../rpc-client";

export function callerFromContext(): SpawnCaller {
  const context = getWorkspaceContext();
  if (!context.sessionId) {
    throw new SpawnRpcClientError(
      "SPAWN_PARENT_SESSION_REQUIRED",
      "fyllo-spawn requires a trusted parent FylloCode Session"
    );
  }
  return { workspaceId: context.workspaceId, parentSessionId: context.sessionId };
}

export function toolSuccess(result: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

export function toolFailure(error: unknown) {
  const rpcError =
    error instanceof SpawnRpcClientError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : {
          code: "SPAWN_INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        };
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: rpcError }) }],
    structuredContent: { error: rpcError },
    isError: true,
  };
}
