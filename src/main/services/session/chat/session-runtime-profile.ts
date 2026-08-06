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

type AcpMcpServers = NonNullable<Parameters<ClientSideConnection["newSession"]>[0]["mcpServers"]>;

export interface ChatRuntimeProfile {
  mcpServers: AcpMcpServers;
  mcpActivationId: string | null;
  revoke(): void;
}

export async function createChatRuntimeProfile(input: {
  sessionMode: ChatSessionMode;
  agentId: string;
  workspaceSnapshot: SessionWorkspaceSnapshot;
  fylloSessionId: string;
  supportsHttp: boolean;
  mcpWorkspaceDescriptor?: McpWorkspaceDescriptorV2;
}): Promise<ChatRuntimeProfile> {
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
