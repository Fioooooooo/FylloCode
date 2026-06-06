import { promises as fs } from "fs";
import { join } from "path";
import type { AcpAgentStatus, AcpStatusCache } from "@shared/types/acp-agent";
import { getDataSubPath } from "@main/infra/paths";

function getStatusCachePath(): string {
  return join(getDataSubPath("acp"), "status-cache.json");
}

async function ensureAgentsDirectory(): Promise<void> {
  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
}

export async function readStatusCache(): Promise<AcpStatusCache | null> {
  try {
    const content = await fs.readFile(getStatusCachePath(), "utf8");
    const parsed = JSON.parse(content) as AcpStatusCache;
    if (!Array.isArray(parsed.statuses)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStatusCache(statuses: AcpAgentStatus[]): Promise<void> {
  await ensureAgentsDirectory();

  const payload: AcpStatusCache = {
    fetchedAt: new Date().toISOString(),
    statuses,
  };

  await fs.writeFile(getStatusCachePath(), JSON.stringify(payload, null, 2), "utf8");
}
