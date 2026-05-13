import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dump, load } from "js-yaml";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";

function yamlPath(projectRoot: string, name: string): string {
  return join(projectRoot, "openspec", "changes", name, ".openspec.yaml");
}

export async function createChange(projectRoot: string, name: string): Promise<void> {
  const path = yamlPath(projectRoot, name);
  if (existsSync(path)) {
    return;
  }
  const cliPath = resolveOpenspecCli();
  await spawnOpenspec(cliPath, ["new", "change", name], projectRoot, {}, false);
  const doc = (load(readFileSync(path, "utf8")) as Record<string, unknown>) ?? {};
  doc.status = "creating";
  writeFileSync(path, dump(doc), "utf8");
}
