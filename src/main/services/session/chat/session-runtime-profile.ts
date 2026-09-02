import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import {
  createBundledMcpActivation,
  revokeBundledMcpActivation,
  toAcpMcpServer,
} from "@main/infra/mcp/bundled-mcp-servers";
import { createSessionMcpWorkspaceDescriptor } from "./mcp-workspace-descriptor";
import type { ChatSessionMode } from "@shared/types/chat";
import type { McpWorkspaceDescriptorV2 } from "@shared/types/mcp-workspace";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import type { BundledMcpServerName } from "@main/infra/mcp/bundled-mcp-registry";

type AcpMcpServers = NonNullable<Parameters<ClientSideConnection["newSession"]>[0]["mcpServers"]>;

export interface SessionRuntimeProfile {
  mcpServers: AcpMcpServers;
  mcpActivationId: string | null;
  revoke(): void;
}

export const WORKFLOW_FRESH_MCP_SERVER_NAMES = [
  "fyllo-specs",
  "fyllo-cortex",
] as const satisfies readonly BundledMcpServerName[];

export async function createChatRuntimeProfile(input: {
  sessionMode: ChatSessionMode;
  agentId: string;
  workspaceSnapshot: SessionWorkspaceSnapshot;
  fylloSessionId: string;
  supportsHttp: boolean;
  mcpWorkspaceDescriptor?: McpWorkspaceDescriptorV2;
}): Promise<SessionRuntimeProfile> {
  if (input.sessionMode === "native") {
    return {
      mcpServers: [],
      mcpActivationId: null,
      revoke: () => undefined,
    };
  }

  const descriptor =
    input.mcpWorkspaceDescriptor ??
    (await createSessionMcpWorkspaceDescriptor(input.workspaceSnapshot, input.fylloSessionId));
  const activation = await createBundledMcpActivation({
    agentId: input.agentId,
    descriptor,
    supportsHttp: input.supportsHttp,
  });

  return {
    mcpServers: activation.servers.map(toAcpMcpServer),
    mcpActivationId: activation.activationId,
    revoke: () => revokeBundledMcpActivation(activation.activationId),
  };
}

export function createSpawnRuntimeProfile(): SessionRuntimeProfile {
  return {
    mcpServers: [],
    mcpActivationId: null,
    revoke: () => undefined,
  };
}

export async function createWorkflowRuntimeProfile(input: {
  agentId: string;
  workspaceDescriptor: McpWorkspaceDescriptorV2;
  supportsHttp: boolean;
}): Promise<SessionRuntimeProfile> {
  const activation = await createBundledMcpActivation({
    agentId: input.agentId,
    descriptor: input.workspaceDescriptor,
    supportsHttp: input.supportsHttp,
    allowedServerNames: WORKFLOW_FRESH_MCP_SERVER_NAMES,
  });
  return {
    mcpServers: activation.servers.map(toAcpMcpServer),
    mcpActivationId: activation.activationId,
    revoke: () => revokeBundledMcpActivation(activation.activationId),
  };
}
