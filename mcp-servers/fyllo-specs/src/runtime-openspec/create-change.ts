import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { dump, load } from "js-yaml";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";

export const GUIDELINES_TASKS_RULE_EN =
  "Evaluate whether this change should add or update local repository guidelines. If so, add a task in tasks.md that names the specific guideline file and what to change.";

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function augmentExistingConfig(configPath: string): void {
  const original = readFileSync(configPath, "utf8");
  if (original.includes(GUIDELINES_TASKS_RULE_EN)) {
    return;
  }

  const parsed = load(original);
  const doc: Record<string, unknown> = isPlainObject(parsed) ? { ...parsed } : {};

  const rules = isPlainObject(doc.rules) ? { ...doc.rules } : {};
  const existingTasks = Array.isArray(rules.tasks) ? [...rules.tasks] : [];
  existingTasks.push(GUIDELINES_TASKS_RULE_EN);
  rules.tasks = existingTasks;
  doc.rules = rules;

  writeFileSync(configPath, dump(doc, { lineWidth: -1 }), "utf8");
}

function ensureOpenSpecProjectInitialized(projectRoot: string): void {
  mkdirSync(join(projectRoot, "openspec", "changes", "archive"), { recursive: true });
  mkdirSync(join(projectRoot, "openspec", "specs"), { recursive: true });

  const configPath = join(projectRoot, "openspec", "config.yaml");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_YAML, "utf8");
    return;
  }

  augmentExistingConfig(configPath);
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
