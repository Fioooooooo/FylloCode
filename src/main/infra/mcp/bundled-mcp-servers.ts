import type { McpServer as AcpMcpServer } from "@agentclientprotocol/sdk";
import { mcpEventsDir, projectDir } from "@main/infra/storage/project-paths";
import type { McpServerSpec, McpServerSpecHttp, McpServerSpecStdio } from "@shared/types/mcp";
import {
  getMcpServerEndpoint,
  waitForBundledMcpInitialReadiness,
  type BundledMcpEndpoint,
} from "./bundled-mcp-host";
import {
  bundledMcpServers,
  resolveBundlePath,
  type BundledMcpServerRegistration,
} from "./bundled-mcp-registry";

export function encodeMcpHeaderValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildHttpSpec(
  server: BundledMcpServerRegistration,
  endpoint: BundledMcpEndpoint,
  opts: { projectPath: string; fylloSessionId?: string }
): McpServerSpecHttp {
  return {
    type: "http",
    name: server.name,
    url: endpoint.url,
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "X-Fyllo-Project-Path": encodeMcpHeaderValue(opts.projectPath),
      "X-Fyllo-Project-Data-Dir": encodeMcpHeaderValue(projectDir(opts.projectPath)),
      "X-Fyllo-Mcp-Event-Dir": encodeMcpHeaderValue(mcpEventsDir(opts.projectPath)),
      ...(opts.fylloSessionId
        ? { "X-Fyllo-Session-Id": encodeMcpHeaderValue(opts.fylloSessionId) }
        : {}),
    },
  };
}

function buildStdioSpec(
  server: BundledMcpServerRegistration,
  opts: { projectPath: string; fylloSessionId?: string }
): McpServerSpecStdio {
  return {
    type: "stdio",
    name: server.name,
    command: process.execPath,
    args: [resolveBundlePath(server.name)],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FYLLO_PROJECT_PATH: opts.projectPath,
      FYLLO_PROJECT_DATA_DIR: projectDir(opts.projectPath),
      FYLLO_MCP_TELEMETRY: "0",
      FYLLO_MCP_EVENT_DIR: mcpEventsDir(opts.projectPath),
      ...(opts.fylloSessionId ? { FYLLO_SESSION_ID: opts.fylloSessionId } : {}),
      ...(server.processEnv?.() ?? {}),
    },
  };
}

export async function resolveBundledMcpServers(opts: {
  projectPath: string;
  fylloSessionId?: string;
  supportsHttp: boolean;
}): Promise<McpServerSpec[]> {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return [];
  }

  await waitForBundledMcpInitialReadiness();

  return bundledMcpServers.map((server) => {
    const endpoint = opts.supportsHttp ? getMcpServerEndpoint(server.name) : null;
    return endpoint ? buildHttpSpec(server, endpoint, opts) : buildStdioSpec(server, opts);
  });
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
