import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dump, load } from "js-yaml";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";

export const GUIDELINES_TASKS_RULE_EN =
  "While drafting tasks.md, decide whether this change requires creating or updating repository guidelines. If it does, add a concrete task naming the target guideline document and the exact change. If it does not, add nothing: never add a task that merely evaluates, confirms, or re-checks whether guidelines need updating.";

const DEFAULT_CONFIG_YAML = `schema: spec-driven

rules:
  tasks:
    - ${GUIDELINES_TASKS_RULE_EN}

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
`;

function yamlPath(projectRoot: string, name: string): string {
  return join(projectRoot, "openspec", "changes", name, ".openspec.yaml");
}

function ensureOpenSpecProjectInitialized(projectRoot: string): void {
  mkdirSync(join(projectRoot, "openspec", "changes", "archive"), { recursive: true });
  mkdirSync(join(projectRoot, "openspec", "specs"), { recursive: true });

  // An existing config.yaml is user-owned: seed the default rules only on first
  // initialization and never rewrite what the user may have edited since.
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
