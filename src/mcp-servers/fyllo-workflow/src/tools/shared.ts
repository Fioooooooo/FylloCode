import { getWorkspaceContext } from "../../../shared/workspace-context";
import type { WorkflowRpcCaller } from "../rpc-schema";
import { WorkflowRpcClientError } from "../rpc-client";

/**
 * The descriptor is injected by the Main proxy. The server never accepts caller-owned identity
 * fields from a tool input; Main revalidates the claimed owner before creating a Run.
 */
export function callerFromContext(): WorkflowRpcCaller {
  const context = getWorkspaceContext();
  if (!context.sessionId) {
    throw new WorkflowRpcClientError(
      "WORKFLOW_INVALID_CALLER",
      "fyllo-workflow requires a trusted parent FylloCode Chat Session"
    );
  }
  return {
    workspaceId: context.workspaceId,
    parentSessionId: context.sessionId,
    callerType: "chat",
  };
}

export function toolSuccess(result: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

export function toolFailure(error: unknown) {
  const rpcError =
    error instanceof WorkflowRpcClientError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : {
          code: "WORKFLOW_INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        };
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: rpcError }) }],
    structuredContent: { error: rpcError },
    isError: true,
  };
}
