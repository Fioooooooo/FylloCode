import type { McpServer as AcpMcpServer } from "@agentclientprotocol/sdk";
import type { McpServerSpec, McpServerSpecHttp, McpServerSpecStdio } from "@shared/types/mcp";
import {
  serializeMcpWorkspaceDescriptor,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";
import {
  getMcpServerEndpoint,
  waitForBundledMcpInitialReadiness,
  type BundledMcpEndpoint,
} from "./bundled-mcp-host";
import {
  bundledMcpServers,
  getBundledMcpTransportPolicy,
  resolveBundlePath,
  type BundledMcpServerRegistration,
} from "./bundled-mcp-registry";
import { mcpAccessGrantRegistry } from "./mcp-access-grant-registry";

function buildHttpSpec(
  server: BundledMcpServerRegistration,
  endpoint: BundledMcpEndpoint,
  token: string
): McpServerSpecHttp {
  return {
    type: "http",
    name: server.name,
    url: endpoint.url,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

function buildStdioSpec(
  server: BundledMcpServerRegistration,
  descriptor: McpWorkspaceDescriptorV2
): McpServerSpecStdio {
  return {
    type: "stdio",
    name: server.name,
    command: process.execPath,
    args: [resolveBundlePath(server.name)],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FYLLO_WORKSPACE_JSON: serializeMcpWorkspaceDescriptor(descriptor),
      FYLLO_MCP_TELEMETRY: "0",
      ...(server.processEnv?.() ?? {}),
    },
  };
}

export interface BundledMcpActivation {
  servers: McpServerSpec[];
  activationId: string | null;
}

export function revokeBundledMcpActivation(activationId: string | null): void {
  if (activationId) {
    mcpAccessGrantRegistry.revokeActivation(activationId);
  }
}

export async function createBundledMcpActivation(opts: {
  agentId: string;
  descriptor: McpWorkspaceDescriptorV2;
  supportsHttp: boolean;
}): Promise<BundledMcpActivation> {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return { servers: [], activationId: null };
  }

  await waitForBundledMcpInitialReadiness();

  const endpoints = new Map(
    bundledMcpServers.map((server) => [
      server.name,
      opts.supportsHttp ? getMcpServerEndpoint(server.name) : null,
    ])
  );
  const allowedServerNames = bundledMcpServers
    .filter((server) => endpoints.get(server.name) !== null)
    .map((server) => server.name);
  const issued =
    allowedServerNames.length > 0
      ? mcpAccessGrantRegistry.issue({
          agentId: opts.agentId,
          ...(opts.descriptor.sessionId ? { fylloSessionId: opts.descriptor.sessionId } : {}),
          descriptor: opts.descriptor,
          allowedServerNames,
        })
      : null;

  return {
    activationId: issued?.activationId ?? null,
    servers: bundledMcpServers.flatMap<McpServerSpec>((server) => {
      const endpoint = endpoints.get(server.name);
      if (endpoint && issued) {
        return [buildHttpSpec(server, endpoint, issued.token)];
      }
      return getBundledMcpTransportPolicy(server) === "http-only"
        ? []
        : [buildStdioSpec(server, opts.descriptor)];
    }),
  };
}

export function toAcpMcpServer(spec: McpServerSpec): AcpMcpServer {
  if (spec.type === "http") {
    return {
      type: "http",
      name: spec.name,
      url: spec.url,
      headers: Object.entries(spec.headers).map(([name, value]) => ({ name, value })),
    };
  }
  return {
    name: spec.name,
    command: spec.command,
    args: spec.args,
    env: Object.entries(spec.env).map(([name, value]) => ({ name, value })),
  };
}
