import { promises as fs } from "fs";
import { join } from "path";
import { z } from "zod";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";
import type { AcpPromptCapabilities } from "@shared/types/acp-agent";

const CACHE_VERSION = 1;

const promptCapabilitiesSchema = z.object({
  image: z.boolean(),
  audio: z.boolean(),
  embeddedContext: z.boolean(),
});

const agentCapabilityRecordSchema = z.object({
  promptCapabilities: promptCapabilitiesSchema,
  capturedAgentVersion: z.string(),
  capturedAt: z.string(),
});

const cacheDocumentSchema = z.object({
  version: z.literal(CACHE_VERSION),
  agents: z.record(z.string(), agentCapabilityRecordSchema),
});

export type AgentCapabilityCacheEntry = z.infer<typeof agentCapabilityRecordSchema>;
type AgentCapabilityCacheDocument = z.infer<typeof cacheDocumentSchema>;

let tempWriteCounter = 0;

function cachePath(): string {
  return join(getDataSubPath("acp"), "agent-capabilities.json");
}

async function writeCacheDocument(document: AgentCapabilityCacheDocument): Promise<void> {
  const filePath = cachePath();
  const tempPath = `${filePath}.${process.pid}.${tempWriteCounter}.tmp`;
  tempWriteCounter += 1;

  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
  try {
    await fs.writeFile(tempPath, JSON.stringify(document, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function loadCache(): Promise<Record<string, AgentCapabilityCacheEntry>> {
  try {
    const content = await fs.readFile(cachePath(), "utf8");
    return cacheDocumentSchema.parse(JSON.parse(content)).agents;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("[agent-capability-store] failed to load cache", error);
    }
    return {};
  }
}

export async function upsertPromptCapabilities(
  agentId: string,
  capabilities: AcpPromptCapabilities,
  capturedAgentVersion: string
): Promise<void> {
  const agents = await loadCache();
  agents[agentId] = {
    promptCapabilities: capabilities,
    capturedAgentVersion,
    capturedAt: new Date().toISOString(),
  };

  await writeCacheDocument({
    version: CACHE_VERSION,
    agents,
  });
}

export async function getCachedPromptCapabilities(
  agentId: string
): Promise<{ capabilities: AcpPromptCapabilities; capturedAgentVersion: string } | null> {
  const cached = (await loadCache())[agentId];
  if (!cached) {
    return null;
  }

  return {
    capabilities: cached.promptCapabilities,
    capturedAgentVersion: cached.capturedAgentVersion,
  };
}

export async function removeAgentCapabilities(agentId: string): Promise<void> {
  const agents = await loadCache();
  delete agents[agentId];

  await writeCacheDocument({
    version: CACHE_VERSION,
    agents,
  });
}
