import { ensureAgent } from "@main/services/platform/_public";
import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { resolveAdditionalDirectoriesCapability } from "@shared/types/acp-agent";
import type { AcpAgentCapabilitySnapshot } from "@shared/types/acp-agent";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

interface AgentWorkspaceCompatibilityDependencies {
  ensureAgent: (agentId: string) => Promise<AcpAgentCapabilitySnapshot>;
}

const defaultDependencies: AgentWorkspaceCompatibilityDependencies = {
  ensureAgent,
};

export async function assertAgentWorkspaceCompatibility(
  agentId: string,
  snapshot: Pick<SessionWorkspaceSnapshot, "workspaceId" | "additionalDirectories">,
  dependencies: AgentWorkspaceCompatibilityDependencies = defaultDependencies
): Promise<void> {
  if (snapshot.additionalDirectories.length === 0) {
    return;
  }

  const capabilities = await dependencies.ensureAgent(agentId);
  const capability = resolveAdditionalDirectoriesCapability(capabilities);
  if (capability !== "supported") {
    throw ipcError(
      IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH,
      "Agent does not support additional directories required by this Workspace",
      {
        workspaceId: snapshot.workspaceId,
        agentId,
        capability,
        additionalDirectoryCount: snapshot.additionalDirectories.length,
      }
    );
  }
}
