import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

export async function migrate(): Promise<void> {
  const installedPath = join(getDataSubPath("acp"), "installed.json");

  let raw: Record<string, Record<string, unknown>>;
  try {
    const content = await fs.readFile(installedPath, "utf8");
    raw = JSON.parse(content) as Record<string, Record<string, unknown>>;
  } catch {
    return;
  }

  let changed = false;
  for (const agentId of Object.keys(raw)) {
    const record = raw[agentId];
    if (typeof record.installedAt === "number") {
      record.installedAt = new Date(record.installedAt).toISOString();
      changed = true;
    }
  }

  if (changed) {
    await fs.writeFile(installedPath, JSON.stringify(raw, null, 2), "utf8");
  }
}
