import { promises as fs } from "fs";
import { join } from "path";
import { net } from "electron";
import type { AcpRegistry, AcpRegistryCache } from "@shared/types/acp-agent";
import { resolveAgentKind } from "@main/domain/acp/agent-kind-map";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";
import { invalidateChangedIcons } from "./acp-icon-cache";

const REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;

let refreshPromise: Promise<AcpRegistry> | null = null;

function getRegistryCachePath(): string {
  return join(getDataSubPath("acp"), "registry-cache.json");
}

function enrichRegistry(data: AcpRegistry): AcpRegistry {
  return {
    ...data,
    agents: data.agents.map((agent) => ({
      ...agent,
      __fyllo: {
        kind: resolveAgentKind(agent.id),
      },
    })),
  };
}

async function ensureAgentsDirectory(): Promise<void> {
  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
}

export async function readRegistryCache(): Promise<AcpRegistryCache | null> {
  try {
    const content = await fs.readFile(getRegistryCachePath(), "utf8");
    return JSON.parse(content) as AcpRegistryCache;
  } catch {
    return null;
  }
}

export function isRegistryCacheExpired(cache: AcpRegistryCache): boolean {
  return Date.now() - new Date(cache.fetchedAt).getTime() > REGISTRY_TTL_MS;
}

async function writeRegistryCache(data: AcpRegistry): Promise<void> {
  await ensureAgentsDirectory();

  const previousCache = await readRegistryCache();
  await invalidateChangedIcons(previousCache?.data ?? null, data);

  const payload: AcpRegistryCache = {
    fetchedAt: new Date().toISOString(),
    data,
  };

  await fs.writeFile(getRegistryCachePath(), JSON.stringify(payload, null, 2), "utf8");
}

async function fetchRegistryFromNetwork(): Promise<AcpRegistry> {
  const response = await net.fetch(REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`获取 Agent registry 失败: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AcpRegistry;
  if (!Array.isArray(data.agents)) {
    throw new Error("Agent registry 数据格式无效");
  }

  return data;
}

async function refreshRegistryInternal(
  onUpdated?: (registry: AcpRegistry) => void
): Promise<AcpRegistry> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const freshRegistry = await fetchRegistryFromNetwork();
      await writeRegistryCache(freshRegistry);
      const enrichedRegistry = enrichRegistry(freshRegistry);
      onUpdated?.(enrichedRegistry);
      return enrichedRegistry;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getRegistry(
  options: {
    onUpdated?: (registry: AcpRegistry) => void;
  } = {}
): Promise<AcpRegistry> {
  const cache = await readRegistryCache();

  if (cache && !isRegistryCacheExpired(cache)) {
    return enrichRegistry(cache.data);
  }

  if (cache) {
    void refreshRegistryInternal(options.onUpdated).catch((error) => {
      logger.warn("[acp] background registry refresh failed", error);
    });
    return enrichRegistry(cache.data);
  }

  return refreshRegistryInternal(options.onUpdated);
}

export async function refreshRegistry(
  options: {
    onUpdated?: (registry: AcpRegistry) => void;
  } = {}
): Promise<AcpRegistry> {
  return refreshRegistryInternal(options.onUpdated);
}
