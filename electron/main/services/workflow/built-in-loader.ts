import { promises as fs } from "fs";
import { app } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { getDataSubPath } from "@main/infra/paths";
import logger from "@main/infra/logger";

export function getBuiltInWorkflowDirectory(): string {
  if (is.dev) {
    return join(process.cwd(), "electron", "main", "workflows", "built-in");
  }

  return join(app.getAppPath(), "electron", "main", "workflows", "built-in");
}

export function getUserWorkflowDirectory(): string {
  return getDataSubPath("workflows");
}

function isWorkflowFile(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

export async function listBuiltInWorkflowFileNames(): Promise<string[]> {
  try {
    const entries = await fs.readdir(getBuiltInWorkflowDirectory(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isWorkflowFile(entry.name))
      .map((entry) => entry.name);
  } catch (error) {
    logger.warn("[workflow] Failed to read built-in workflow directory", error);
    return [];
  }
}

export async function initBuiltInWorkflows(): Promise<void> {
  try {
    const fileNames = await listBuiltInWorkflowFileNames();
    const targetDirectory = getUserWorkflowDirectory();
    await fs.mkdir(targetDirectory, { recursive: true });

    await Promise.all(
      fileNames.map(async (fileName) => {
        const sourcePath = join(getBuiltInWorkflowDirectory(), fileName);
        const targetPath = join(targetDirectory, fileName);

        try {
          await fs.access(targetPath);
          return;
        } catch {
          // Missing target file is expected on first launch.
        }

        try {
          const content = await fs.readFile(sourcePath);
          await fs.writeFile(targetPath, content);
        } catch (error) {
          logger.warn(`[workflow] Failed to initialize built-in workflow: ${fileName}`, error);
        }
      })
    );
  } catch (error) {
    logger.warn("[workflow] Failed to initialize built-in workflows", error);
  }
}
