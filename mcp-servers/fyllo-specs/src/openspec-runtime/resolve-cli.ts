import { existsSync } from "fs";
import { join } from "path";

function getAppUnpackedPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return resourcesPath ? join(resourcesPath, "app.asar.unpacked") : null;
}

export function resolveOpenspecCli(): string {
  if (process.env.FYLLO_OPENSPEC_CLI_PATH) {
    return process.env.FYLLO_OPENSPEC_CLI_PATH;
  }

  const appUnpackedPath = getAppUnpackedPath();
  const fallbackCandidates = [
    join(process.cwd(), "node_modules", "@fission-ai", "openspec", "bin", "openspec.js"),
    ...(appUnpackedPath
      ? [join(appUnpackedPath, "node_modules", "@fission-ai", "openspec", "bin", "openspec.js")]
      : []),
  ];

  return fallbackCandidates.find((candidate) => existsSync(candidate)) ?? fallbackCandidates[0];
}
