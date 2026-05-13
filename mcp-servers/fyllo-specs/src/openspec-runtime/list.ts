import { resolveProjectRoot } from "../utils/project-root";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";
import type { ChangeSummary } from "./types";

export async function listChanges(projectRoot = resolveProjectRoot()): Promise<ChangeSummary[]> {
  const cliPath = resolveOpenspecCli();
  const result = (await spawnOpenspec(cliPath, ["list", "--json"], projectRoot)) as {
    changes?: ChangeSummary[];
  };
  return result.changes ?? [];
}
