import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

export async function migrate(): Promise<void> {
  const projectsDir = getDataSubPath("projects");

  let projectEntries: string[];
  try {
    projectEntries = await fs.readdir(projectsDir);
  } catch {
    return;
  }

  for (const projectEntry of projectEntries) {
    const sessionsDir = join(projectsDir, projectEntry, "sessions");

    let sessionFiles: string[];
    try {
      sessionFiles = await fs.readdir(sessionsDir);
    } catch {
      continue;
    }

    for (const file of sessionFiles) {
      if (!file.startsWith("session") || !file.endsWith(".json")) continue;

      const filePath = join(sessionsDir, file);
      let raw: Record<string, unknown>;
      try {
        const content = await fs.readFile(filePath, "utf8");
        raw = JSON.parse(content) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Already migrated or no snake_case field present
      if (!Object.prototype.hasOwnProperty.call(raw, "config_options")) continue;

      const { config_options, ...rest } = raw;
      const migrated = { ...rest, configOptions: config_options };
      await fs.writeFile(filePath, JSON.stringify(migrated, null, 2), "utf8");
    }
  }
}
