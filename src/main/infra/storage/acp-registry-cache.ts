import { promises as fs } from "fs";
import { join } from "path";
import { net } from "electron";
import type { AcpRegistry, AcpRegistryCache } from "@shared/types/acp-agent";
import { resolveAgentKind } from "@main/domain/platform/acp-agent/agent-kind-map";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";
import { invalidateChangedIcons } from "./acp-icon-cache";

export const CURATED_REGISTRY_URL = "https://curated-acp-agents.onrender.com/registry.json";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistryPayload(value: unknown): value is AcpRegistry {
  return isRecord(value) && Array.isArray(value.agents);
}

async function ensureAgentsDirectory(): Promise<void> {
  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
}

export async function readRegistryCache(): Promise<AcpRegistryCache | null> {
  try {
    const content = await fs.readFile(getRegistryCachePath(), "utf8");
    const parsed: unknown = JSON.parse(content);
    if (
      !isRecord(parsed) ||
      typeof parsed.fetchedAt !== "string" ||
      !isRegistryPayload(parsed.data)
    ) {
      return null;
    }
    return parsed as unknown as AcpRegistryCache;
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
  await invalidateChangedIcons(
    previousCache?.source === CURATED_REGISTRY_URL ? previousCache.data : null,
    data
  );

  const payload: AcpRegistryCache = {
    source: CURATED_REGISTRY_URL,
    fetchedAt: new Date().toISOString(),
    data,
  };

  await fs.writeFile(getRegistryCachePath(), JSON.stringify(payload, null, 2), "utf8");
}

async function fetchRegistryFromNetwork(): Promise<AcpRegistry> {
  const response = await net.fetch(CURATED_REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`获取 Agent registry 失败: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();
  if (!isRegistryPayload(data)) {
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
  const isCurrentSource = cache?.source === CURATED_REGISTRY_URL;

  if (cache && isCurrentSource && !isRegistryCacheExpired(cache)) {
    return enrichRegistry(cache.data);
  }

  if (cache && isCurrentSource) {
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
