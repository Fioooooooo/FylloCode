import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { getAppAsarPath, getAppUnpackedPath } from "@main/infra/paths";

export type BundledMcpServerName = "fyllo-specs" | "fyllo-cortex";

export interface BundledMcpServerRegistration {
  name: BundledMcpServerName;
  processEnv?: () => Record<string, string>;
}

export const bundledMcpServers: readonly BundledMcpServerRegistration[] = [
  {
    name: "fyllo-specs",
    processEnv: () => ({
      FYLLO_OPENSPEC_CLI_PATH: resolveOpenspecCliPath(),
    }),
  },
  {
    name: "fyllo-cortex",
  },
];

export function resolveBundlePath(serverName: BundledMcpServerName): string {
  if (is.dev) {
    return join(process.cwd(), "out", "mcp-servers", serverName, "index.js");
  }
  return join(getAppUnpackedPath(), "mcp-servers", serverName, "index.js");
}

function resolveOpenspecCliPath(): string {
  const appRoot = is.dev ? process.cwd() : getAppAsarPath();
  return join(appRoot, "node_modules", "@fission-ai", "openspec", "bin", "openspec.js");
}
