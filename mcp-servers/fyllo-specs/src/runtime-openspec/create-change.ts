import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dump, load } from "js-yaml";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";

const DEFAULT_CONFIG_YAML = `schema: spec-driven

# Project context (optional)
# This is shown to AI when creating artifacts.
# Add your tech stack, conventions, style guides, domain knowledge, etc.
# Example:
#   context: |
#     Tech stack: TypeScript, React, Node.js
#     We use conventional commits
#     Domain: e-commerce platform

# Per-artifact rules (optional)
# Add custom rules for specific artifacts.
# Example:
#   rules:
#     proposal:
#       - Keep proposals under 500 words
#       - Always include a "Non-goals" section
#     tasks:
#       - Break tasks into chunks of max 2 hours
`;

function yamlPath(projectRoot: string, name: string): string {
  return join(projectRoot, "openspec", "changes", name, ".openspec.yaml");
}

function ensureOpenSpecProjectInitialized(projectRoot: string): void {
  mkdirSync(join(projectRoot, "openspec", "changes", "archive"), { recursive: true });
  mkdirSync(join(projectRoot, "openspec", "specs"), { recursive: true });

  const configPath = join(projectRoot, "openspec", "config.yaml");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_YAML, "utf8");
  }
}

export async function createChange(projectRoot: string, name: string): Promise<void> {
  ensureOpenSpecProjectInitialized(projectRoot);
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
