import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getWorkspaceContext } from "../../../shared/workspace-context";
import {
  availableAgentsParamsSchema,
  availableAgentsResultSchema,
  checkSessionStatusParamsSchema,
  checkSessionStatusResultSchema,
  promptToAgentParamsSchema,
  promptToAgentResultSchema,
  readResponseParamsSchema,
  readResponseResultSchema,
  type SpawnCaller,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient, SpawnRpcClientError } from "../rpc-client";

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

function success(result: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

function failure(error: unknown) {
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

export function registerTools(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "available_agents",
    {
      description:
        "List installed ACP Agents available for delegated work. This is read-only and does not start an Agent process.",
      inputSchema: availableAgentsParamsSchema,
    },
    async (_input, extra) => {
      try {
        return success(
          await rpc.call({
            method: "available_agents",
            caller: callerFromContext(),
            params: {},
            resultSchema: availableAgentsResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "prompt_to_agent",
    {
      description:
        "Delegate one focused task to an installed ACP Agent, or continue a spawned Session. When a call omits sessionId and its result contains the newly created Session identity, follow the injected spawn.session Signal contract once for either synchronous or background creation; do not repeat it for continuation calls. Set background=true to return once Main has durably accepted and dispatched the turn; poll check_session_status and read the completed result with responseId + read_response. Background turns have no absolute runtime limit, but remain subject to inactivity cancellation and active-turn capacity. Split parallel work into non-overlapping file scopes because spawned Agents share the parent Workspace directories.",
      inputSchema: promptToAgentParamsSchema,
    },
    async (input, extra) => {
      try {
        return success(
          await rpc.call({
            method: "prompt_to_agent",
            caller: callerFromContext(),
            params: input,
            resultSchema: promptToAgentResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "check_session_status",
    {
      description:
        "Read a spawned Session status snapshot without waiting for an active prompt to finish.",
      inputSchema: checkSessionStatusParamsSchema,
    },
    async (input, extra) => {
      try {
        return success(
          await rpc.call({
            method: "check_session_status",
            caller: callerFromContext(),
            params: input,
            resultSchema: checkSessionStatusResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "read_response",
    {
      description:
        "Read the next bounded chunk of a completed spawned response using its responseId and opaque cursor.",
      inputSchema: readResponseParamsSchema,
    },
    async (input, extra) => {
      try {
        return success(
          await rpc.call({
            method: "read_response",
            caller: callerFromContext(),
            params: input,
            resultSchema: readResponseResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return failure(error);
      }
    }
  );
}
