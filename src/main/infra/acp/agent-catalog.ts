import { createHash } from "crypto";
import { basename, isAbsolute } from "path";
import { expandHomePath } from "@main/infra/paths";
import { findCommandPath } from "@main/infra/acp/detector";
import { readCustomAgents } from "@main/infra/storage/custom-agent-config-store";
import { getRegistry } from "@main/infra/storage/acp-registry-cache";
import type { AcpCustomAgentConfig, CatalogAgent } from "@shared/types/acp-agent";

const CUSTOM_AGENT_ID_PREFIX = "custom-";

export function isCustomAgentId(id: string): boolean {
  return id.startsWith(CUSTOM_AGENT_ID_PREFIX);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

export async function resolveCustomCommandPath(command: string): Promise<string> {
  const expanded = expandHomePath(command);
  if (isAbsolute(expanded)) {
    return expanded;
  }

  const fromPath = await findCommandPath(expanded);
  return fromPath ?? expanded;
}

export function generateCustomAgentId(command: string, args: string[]): string {
  const normalizedCommand = expandHomePath(command);
  const payload = JSON.stringify([normalizedCommand, args ?? []]);
  const base = slug(basename(normalizedCommand));
  return `${CUSTOM_AGENT_ID_PREFIX}${base}-${shortHash(payload)}`;
}

async function buildCustomCatalogAgent(
  displayName: string,
  config: AcpCustomAgentConfig
): Promise<CatalogAgent> {
  const resolvedCommand = await resolveCustomCommandPath(config.command);
  const args = config.args ?? [];
  const env = config.env ?? {};

  return {
    id: generateCustomAgentId(resolvedCommand, args),
    source: "custom",
    name: displayName,
    customConfig: {
      displayName,
      command: resolvedCommand,
      args,
      env,
    },
  };
}

export async function listAgents(): Promise<CatalogAgent[]> {
  const [registry, customConfig] = await Promise.all([getRegistry(), readCustomAgents()]);

  const registryAgents: CatalogAgent[] = registry.agents.map((entry) => ({
    id: entry.id,
    source: "registry",
    name: entry.name,
    registryEntry: entry,
  }));

  const customAgents: CatalogAgent[] = await Promise.all(
    Object.entries(customConfig.agent_servers).map(([displayName, config]) =>
      buildCustomCatalogAgent(displayName, config)
    )
  );

  // 相同 command/args 的 custom agent 会生成相同 id，去重保留第一个
  const seenIds = new Set<string>(registryAgents.map((a) => a.id));
  const dedupedCustomAgents: CatalogAgent[] = [];

  for (const agent of customAgents) {
    if (seenIds.has(agent.id)) {
      continue;
    }
    seenIds.add(agent.id);
    dedupedCustomAgents.push(agent);
  }

  return [...registryAgents, ...dedupedCustomAgents];
}

export async function getAgentById(id: string): Promise<CatalogAgent | undefined> {
  if (!isCustomAgentId(id)) {
    const registry = await getRegistry();
    const entry = registry.agents.find((agent) => agent.id === id);
    if (!entry) {
      return undefined;
    }
    return {
      id: entry.id,
      source: "registry",
      name: entry.name,
      registryEntry: entry,
    };
  }

  const customConfig = await readCustomAgents();
  for (const [displayName, config] of Object.entries(customConfig.agent_servers)) {
    const resolvedCommand = await resolveCustomCommandPath(config.command);
    const args = config.args ?? [];
    if (generateCustomAgentId(resolvedCommand, args) === id) {
      return buildCustomCatalogAgent(displayName, config);
    }
  }

  return undefined;
}
