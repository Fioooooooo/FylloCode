import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  promptToAgentParamsSchema,
  promptToAgentResultSchema,
} from "@shared/types/fyllo-spawn-rpc";
import { SpawnRpcClient } from "../rpc-client";
import { callerFromContext, toolFailure, toolSuccess } from "./shared";

export function registerPromptToAgentTool(server: McpServer, rpc: SpawnRpcClient): void {
  server.registerTool(
    "prompt_to_agent",
    {
      description:
        "Delegate one focused task to an installed ACP Agent, or continue a spawned Session. On a new call, omitting folderId inherits the complete parent Workspace snapshot. For a single-root Agent that cannot use additional directories, set folderId only on a new call (omit sessionId) to select one Folder from the parent Session's authorized snapshot; that Folder becomes cwd and no additional directories are sent. Continuations must provide sessionId without folderId, and their persisted Workspace or Folder scope cannot be changed. If the complete Workspace causes a capability mismatch, no Session or turn is created: retry as a new call with one of the authorized Folder IDs and names, or choose an Agent that supports additional directories when the task spans multiple Folders. RECOMMENDED: use the default background mode (background=true). Main durably records and automatically exposes both newly created and continued owner-matched Sessions through the parent Chat activity view; the optional spawn.session Signal is only a contextual deep link and is not required for discovery, status updates, or detail access. The call returns 'accepted' as soon as Main has durably accepted and dispatched the turn; keep working or report progress to the user while the spawned Agent runs, e.g. poll in a loop: check_session_status(sessionId) -> if running, tell the user what the spawned Agent is doing and poll again -> once idle, read the result with responseId + read_response. Background mode keeps both Agents observable in parallel and suits long or complex delegated tasks; background turns have no absolute runtime limit, but remain subject to inactivity cancellation and active-turn capacity. Only pass background=false for simple, fast tasks (under ~30 seconds) where you have no other work and intentionally block until the result; sync mode blocks this Agent until the turn completes, while the same Main-owned activity view remains the source of truth. On the first formal call, you may provide semantic model and thought_level values directly; no probe is needed. Main activates the real ACP Session and resolves both values from its live configOptions, applying model first and resolving thought_level from the complete snapshot returned after that change. These fields are semantic value/name queries, not option IDs. Zero candidates, multiple candidates, or a missing/duplicate category returns configuration_required with ordered live candidates and promptDispatched=false; choose an exact value from the result or ask the user, then retry the original prompt with the same sessionId. The config map remains the exact live option-ID escape hatch for mode, model_config, boolean, and Agent-specific options. Same-target equal values are deduplicated; conflicting semantic and raw values return SPAWN_INVALID_REQUEST. A semantic set failure or incomplete snapshot returns SPAWN_CONFIG_FAILED and never dispatches the prompt. Live model lists are Session-specific: initialize, available_agents, and static capability caches do not provide them. If a new Session identity is returned and a contextual link helps the current response, you may emit the injected spawn.session Signal once; do not repeat it for continuation calls, and never treat the Signal as the discovery mechanism. Split parallel work into non-overlapping file scopes because spawned Agents share the parent Workspace directories.",
      inputSchema: promptToAgentParamsSchema,
    },
    async (input, extra) => {
      try {
        return toolSuccess(
          await rpc.call({
            method: "prompt_to_agent",
            caller: callerFromContext(),
            params: input,
            resultSchema: promptToAgentResultSchema,
            signal: extra.signal,
          })
        );
      } catch (error) {
        return toolFailure(error);
      }
    }
  );
}
