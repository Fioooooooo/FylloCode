import { promises as fs } from "fs";
import { join } from "path";
import { z } from "zod";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";
import type { AcpAgentCapabilityCache, AcpAgentCapabilitySnapshot } from "@shared/types/acp-agent";

const CACHE_VERSION = 2;

const metaSchema = z.record(z.string(), z.unknown()).nullable().optional();

const authMethodSchema = z
  .object({
    _meta: metaSchema,
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

const promptCapabilitiesSchema = z
  .object({
    _meta: metaSchema,
    image: z.boolean().optional(),
    audio: z.boolean().optional(),
    embeddedContext: z.boolean().optional(),
  })
  .passthrough();

const mcpCapabilitiesSchema = z
  .object({
    _meta: metaSchema,
    acp: z.boolean().optional(),
    http: z.boolean().optional(),
    sse: z.boolean().optional(),
  })
  .passthrough();

const sessionCapabilityMarkerSchema = z
  .object({
    _meta: metaSchema,
  })
  .passthrough();

const sessionCapabilitiesSchema = z
  .object({
    _meta: metaSchema,
    additionalDirectories: sessionCapabilityMarkerSchema.nullable().optional(),
    close: sessionCapabilityMarkerSchema.nullable().optional(),
    delete: sessionCapabilityMarkerSchema.nullable().optional(),
    fork: sessionCapabilityMarkerSchema.nullable().optional(),
    list: sessionCapabilityMarkerSchema.nullable().optional(),
    resume: sessionCapabilityMarkerSchema.nullable().optional(),
  })
  .passthrough();

const agentCapabilityRecordSchema = z
  .object({
    authMethods: z.array(authMethodSchema).optional(),
    promptCapabilities: promptCapabilitiesSchema.optional(),
    mcpCapabilities: mcpCapabilitiesSchema.optional(),
    sessionCapabilities: sessionCapabilitiesSchema.optional(),
    capabilityCompleteness: z.enum(["complete", "partial"]).optional(),
    capturedAgentVersion: z.string(),
    capturedAt: z.string(),
  })
  .passthrough();

const cacheDocumentSchema = z.object({
  version: z.literal(CACHE_VERSION),
  agents: z.record(z.string(), agentCapabilityRecordSchema),
});

const legacyPromptCapabilitiesSchema = z.object({
  image: z.boolean(),
  audio: z.boolean(),
  embeddedContext: z.boolean(),
});

const legacyAgentCapabilityRecordSchema = z.object({
  promptCapabilities: legacyPromptCapabilitiesSchema,
  capturedAgentVersion: z.string(),
  capturedAt: z.string(),
});

const legacyCacheDocumentSchema = z.object({
  version: z.literal(1),
  agents: z.record(z.string(), legacyAgentCapabilityRecordSchema),
});

interface AgentCapabilitySource {
  authMethods?: AcpAgentCapabilitySnapshot["authMethods"];
  promptCapabilities?: AcpAgentCapabilitySnapshot["promptCapabilities"];
  mcpCapabilities?: AcpAgentCapabilitySnapshot["mcpCapabilities"];
  sessionCapabilities?: AcpAgentCapabilitySnapshot["sessionCapabilities"];
}

interface AgentCapabilityCacheDocument {
  version: typeof CACHE_VERSION;
  agents: AcpAgentCapabilityCache;
}

let tempWriteCounter = 0;
let mutationQueue: Promise<void> = Promise.resolve();

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

export async function loadCache(): Promise<AcpAgentCapabilityCache> {
  try {
    const content = await fs.readFile(cachePath(), "utf8");
    const raw: unknown = JSON.parse(content);
    const current = cacheDocumentSchema.safeParse(raw);
    if (current.success) {
      return Object.fromEntries(
        Object.entries(current.data.agents).map(([agentId, snapshot]) => [
          agentId,
          {
            ...snapshot,
            capabilityCompleteness: snapshot.capabilityCompleteness ?? "complete",
          },
        ])
      ) as AcpAgentCapabilityCache;
    }

    const legacy = legacyCacheDocumentSchema.safeParse(raw);
    if (legacy.success) {
      return Object.fromEntries(
        Object.entries(legacy.data.agents).map(([agentId, snapshot]) => [
          agentId,
          { ...snapshot, capabilityCompleteness: "partial" as const },
        ])
      );
    }

    throw current.error;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("[agent-capability-store] failed to load cache", error);
    }
    return {};
  }
}

function enqueueMutation(mutation: () => Promise<void>): Promise<void> {
  const result = mutationQueue.then(mutation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

export async function upsertAgentCapabilities(
  agentId: string,
  capabilities: AgentCapabilitySource,
  capturedAgentVersion: string
): Promise<void> {
  await enqueueMutation(async () => {
    const agents = await loadCache();
    agents[agentId] = {
      ...capabilities,
      capabilityCompleteness: "complete",
      capturedAgentVersion,
      capturedAt: new Date().toISOString(),
    };

    await writeCacheDocument({
      version: CACHE_VERSION,
      agents,
    });
  });
}

export async function getCachedAgentCapabilities(
  agentId: string
): Promise<AcpAgentCapabilitySnapshot | null> {
  const cached = (await loadCache())[agentId];
  return cached ?? null;
}

export async function removeAgentCapabilities(agentId: string): Promise<void> {
  await enqueueMutation(async () => {
    const agents = await loadCache();
    delete agents[agentId];

    await writeCacheDocument({
      version: CACHE_VERSION,
      agents,
    });
  });
}

export async function removeCustomAgentCapabilities(): Promise<void> {
  await enqueueMutation(async () => {
    const agents = await loadCache();
    let changed = false;

    for (const agentId of Object.keys(agents)) {
      if (agentId.startsWith("custom-")) {
        delete agents[agentId];
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    await writeCacheDocument({
      version: CACHE_VERSION,
      agents,
    });
  });
}
