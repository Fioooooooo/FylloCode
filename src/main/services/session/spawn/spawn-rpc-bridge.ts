import { registerBundledMcpRpcHandler } from "@main/infra/mcp/bundled-mcp-host";
import {
  availableAgentsResultSchema,
  cancelSessionResultSchema,
  checkSessionStatusResultSchema,
  promptToAgentResultSchema,
  readResponseResultSchema,
  type FylloSpawnRpcRequest,
} from "@shared/types/fyllo-spawn-rpc";
import { spawnedSessionManager } from "./spawned-session-manager";

let unregisterBridge: (() => void) | null = null;

async function handleSpawnRpc(
  request: FylloSpawnRpcRequest,
  signal: AbortSignal
): Promise<unknown> {
  switch (request.method) {
    case "available_agents":
      return availableAgentsResultSchema.parse(
        await spawnedSessionManager.availableAgents(request.caller)
      );
    case "prompt_to_agent":
      return promptToAgentResultSchema.parse(
        await spawnedSessionManager.promptToAgent(request.caller, request.params, signal)
      );
    case "check_session_status":
      return checkSessionStatusResultSchema.parse(
        await spawnedSessionManager.checkSessionStatus(request.caller, request.params.sessionId)
      );
    case "read_response":
      return readResponseResultSchema.parse(
        await spawnedSessionManager.readResponse(request.caller, request.params)
      );
    case "cancel_session":
      return cancelSessionResultSchema.parse(
        await spawnedSessionManager.cancelSession(request.caller, request.params.sessionId)
      );
  }
}

export function registerSpawnRpcBridge(): void {
  if (unregisterBridge) return;
  unregisterBridge = registerBundledMcpRpcHandler("fyllo-spawn", handleSpawnRpc);
}

export function unregisterSpawnRpcBridge(): void {
  unregisterBridge?.();
  unregisterBridge = null;
}
