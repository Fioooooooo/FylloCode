import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { removeCustomAgentCapabilities } from "@main/infra/storage/agent-capability-store";
import type { AcpCustomAgentsJson } from "@shared/types/acp-agent";
import logger from "@main/infra/logger";

function getCustomAgentsPath(): string {
  return join(getDataSubPath("acp"), "custom-agents.json");
}

async function ensureAgentsDirectory(): Promise<void> {
  await fs.mkdir(getDataSubPath("acp"), { recursive: true });
}

export class CustomAgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomAgentConfigError";
  }
}

export async function readCustomAgents(): Promise<AcpCustomAgentsJson> {
  try {
    const content = await fs.readFile(getCustomAgentsPath(), "utf8");
    const parsed = JSON.parse(content) as unknown;

    if (!isValidCustomAgentsJson(parsed)) {
      throw new CustomAgentConfigError(
        `Invalid custom-agents.json: top-level ".agent_servers" must be an object`
      );
    }

    return parsed;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { agent_servers: {} };
    }

    if (error instanceof CustomAgentConfigError) {
      throw error;
    }

    throw new CustomAgentConfigError(
      `Failed to parse custom-agents.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function writeCustomAgents(config: AcpCustomAgentsJson): Promise<void> {
  if (!isValidCustomAgentsJson(config)) {
    throw new CustomAgentConfigError(
      `Invalid custom-agents.json: top-level ".agent_servers" must be an object`
    );
  }

  await ensureAgentsDirectory();
  await fs.writeFile(getCustomAgentsPath(), JSON.stringify(config, null, 2), "utf8");
  await removeAllCustomAgentCapabilities();
}

function isValidCustomAgentsJson(value: unknown): value is AcpCustomAgentsJson {
  return (
    typeof value === "object" &&
    value !== null &&
    "agent_servers" in value &&
    typeof (value as Record<string, unknown>).agent_servers === "object" &&
    (value as Record<string, unknown>).agent_servers !== null
  );
}

export async function removeAllCustomAgentCapabilities(): Promise<void> {
  try {
    await removeCustomAgentCapabilities();
  } catch (error: unknown) {
    logger.warn("[custom-agent-config-store] failed to clear custom agent capabilities", error);
  }
}
