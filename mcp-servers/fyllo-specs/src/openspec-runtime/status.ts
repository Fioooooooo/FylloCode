import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";
import type { ArtifactStatus } from "./types";

export async function computeStatus(
  projectRoot: string,
  changeName: string
): Promise<{
  applyRequires: string[];
  artifacts: ArtifactStatus[];
  schemaName: string;
}> {
  const cliPath = resolveOpenspecCli();
  const result = (await spawnOpenspec(
    cliPath,
    ["status", "--change", changeName, "--json"],
    projectRoot
  )) as {
    applyRequires?: string[];
    artifacts?: ArtifactStatus[];
    schemaName?: string;
  };
  return {
    applyRequires: result.applyRequires ?? [],
    artifacts: result.artifacts ?? [],
    schemaName: result.schemaName ?? "spec-driven",
  };
}
