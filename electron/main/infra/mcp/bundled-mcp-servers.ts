import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { getAppUnpackedPath } from "@main/infra/paths";
import type { McpEnvVariable, McpServerSpec } from "@shared/types/mcp";

function resolveBundlePath(): string {
  if (is.dev) {
    return join(process.cwd(), "out", "mcp-servers", "fyllo-specs", "index.js");
  }
  return join(getAppUnpackedPath(), "mcp-servers", "fyllo-specs", "index.js");
}

function resolveOpenspecCliPath(): string {
  const appRoot = is.dev ? process.cwd() : getAppUnpackedPath();
  return join(appRoot, "node_modules", "@fission-ai", "openspec", "bin", "openspec.js");
}

export function getBundledMcpServers(opts: { projectPath: string }): McpServerSpec[] {
  if (process.env.FYLLO_DISABLE_BUNDLED_MCP === "1") {
    return [];
  }

  return [
    {
      name: "fyllo-specs",
      command: process.execPath,
      args: [resolveBundlePath()],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        FYLLO_PROJECT_PATH: opts.projectPath,
        FYLLO_OPENSPEC_CLI_PATH: resolveOpenspecCliPath(),
        FYLLO_MCP_TELEMETRY: "0",
      },
    },
  ];
}

export function toAcpMcpServerEnv(env: Record<string, string>): McpEnvVariable[] {
  return Object.entries(env).map(([name, value]) => ({ name, value }));
}
