import { promises as fs } from "fs";
import { join } from "path";
import { net } from "electron";
import type { AcpRegistry } from "@shared/types/acp-agent";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";

function getIconsDirectory(): string {
  return join(getDataSubPath("acp"), "icons");
}

function getIconFilePath(agentId: string): string {
  return join(getIconsDirectory(), agentId);
}

async function ensureIconsDirectory(): Promise<void> {
  await fs.mkdir(getIconsDirectory(), { recursive: true });
}

async function readIconFromCache(agentId: string): Promise<string | null> {
  try {
    return await fs.readFile(getIconFilePath(agentId), "utf8");
  } catch {
    return null;
  }
}

async function downloadIconAsDataUrl(url: string): Promise<string> {
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`下载图标失败: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function writeIconToCache(agentId: string, dataUrl: string): Promise<void> {
  await ensureIconsDirectory();
  await fs.writeFile(getIconFilePath(agentId), dataUrl, "utf8");
}

export async function deleteAgentIcon(agentId: string): Promise<void> {
  await fs.rm(getIconFilePath(agentId), { force: true });
}

export async function invalidateChangedIcons(
  previousRegistry: AcpRegistry | null,
  nextRegistry: AcpRegistry
): Promise<void> {
  if (!previousRegistry) {
    return;
  }

  const previousIcons = new Map(
    previousRegistry.agents.map((agent) => [agent.id, agent.icon ?? null])
  );

  await Promise.allSettled(
    nextRegistry.agents.map(async (agent) => {
      const previousIcon = previousIcons.get(agent.id) ?? null;
      const nextIcon = agent.icon ?? null;
      if (previousIcon !== nextIcon) {
        await deleteAgentIcon(agent.id);
      }
    })
  );
}

export async function getAgentIcons(registry: AcpRegistry): Promise<Record<string, string>> {
  const icons: Record<string, string> = {};

  await Promise.allSettled(
    registry.agents.map(async (agent) => {
      if (!agent.icon) {
        return;
      }

      const cached = await readIconFromCache(agent.id);
      if (cached) {
        icons[agent.id] = cached;
        return;
      }

      try {
        const downloaded = await downloadIconAsDataUrl(agent.icon);
        await writeIconToCache(agent.id, downloaded);
        icons[agent.id] = downloaded;
      } catch (error) {
        logger.warn(`[acp] icon download failed for ${agent.id}`, error);
      }
    })
  );

  return icons;
}
