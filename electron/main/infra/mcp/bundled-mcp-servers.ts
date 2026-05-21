import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { getAppAsarPath, getAppUnpackedPath } from "@main/infra/paths";
import type { McpEnvVariable, McpServerSpec } from "@shared/types/mcp";

type BundledMcpServerName = "fyllo-specs" | "fyllo-skills";

interface BundledMcpServerRegistration {
  name: BundledMcpServerName;
  env?: () => Record<string, string>;
}

const bundledMcpServers: BundledMcpServerRegistration[] = [
  {
    name: "fyllo-specs",
    env: () => ({
      FYLLO_OPENSPEC_CLI_PATH: resolveOpenspecCliPath(),
    }),
  },
  {
    name: "fyllo-skills",
  },
];

function resolveBundlePath(serverName: BundledMcpServerName): string {
  if (is.dev) {
    return join(process.cwd(), "out", "mcp-servers", serverName, "index.js");
  }
  return join(getAppUnpackedPath(), "mcp-servers", serverName, "index.js");
}

function resolveOpenspecCliPath(): string {
  // The OpenSpec CLI stays inside app.asar in production so Node resolves its
  // ESM package dependencies (for example `commander`) from the same packaged
  // node_modules tree instead of crossing into app.asar.unpacked.
  const appRoot = is.dev ? process.cwd() : getAppAsarPath();
  return join(appRoot, "node_modules", "@fission-ai", "openspec", "bin", "openspec.js");
}

export function getBundledMcpServers(opts: { projectPath: string }): McpServerSpec[] {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return [];
  }

  return bundledMcpServers.map((server) => ({
    name: server.name,
    command: process.execPath,
    args: [resolveBundlePath(server.name)],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FYLLO_PROJECT_PATH: opts.projectPath,
      FYLLO_MCP_TELEMETRY: "0",
      ...(server.env?.() ?? {}),
    },
  }));
}

export function toAcpMcpServerEnv(env: Record<string, string>): McpEnvVariable[] {
  return Object.entries(env).map(([name, value]) => ({ name, value }));
}
