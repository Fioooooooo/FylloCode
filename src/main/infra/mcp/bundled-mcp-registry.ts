import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { getAppAsarPath, getAppUnpackedPath } from "@main/infra/paths";

export type BundledMcpServerName = "fyllo-specs" | "fyllo-cortex" | "fyllo-spawn";
export type BundledMcpTransportPolicy = "http-or-stdio" | "http-only";

export interface BundledMcpServerRegistration {
  name: BundledMcpServerName;
  transportPolicy?: BundledMcpTransportPolicy;
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
  {
    name: "fyllo-spawn",
    transportPolicy: "http-only",
  },
];

export function getBundledMcpTransportPolicy(
  server: BundledMcpServerRegistration
): BundledMcpTransportPolicy {
  return server.transportPolicy ?? "http-or-stdio";
}

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
