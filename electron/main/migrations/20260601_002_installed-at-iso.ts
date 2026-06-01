import { promises as fs } from "fs";
import { join } from "path";
import type { MigrationContext } from "./types";

export async function migrate({ dataPath }: MigrationContext): Promise<void> {
  const installedPath = join(dataPath, "acp", "installed.json");

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
