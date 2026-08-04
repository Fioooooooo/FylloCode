import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath, getResourcesPath } from "@main/infra/paths";
import logger from "@main/infra/logger";

const BUILT_IN_WORKFLOW_RELATIVE_PATH = ["workflows", "built-in"] as const;
let atomicWriteSequence = 0;

async function writeBuiltInWorkflowAtomically(
  targetPath: string,
  content: Buffer,
  signal?: AbortSignal
): Promise<void> {
  const tempPath = `${targetPath}.tmp-${process.pid}-${atomicWriteSequence++}`;
  try {
    if (signal?.aborted) return;
    await fs.writeFile(tempPath, content, { flag: "wx" });
    if (signal?.aborted) return;
    await fs.rename(tempPath, targetPath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Location of the read-only, app-shipped workflow templates.
 *
 * - Dev: `resources/workflows/built-in/` inside the repo.
 * - Prod: `resources/workflows/built-in/` inside the packaged app. With the
 *   current electron-builder config this is unpacked to
 *   `process.resourcesPath/app.asar.unpacked/resources/workflows/built-in/`.
 */
export function getBuiltInWorkflowDirectory(): string {
  return join(getResourcesPath(), ...BUILT_IN_WORKFLOW_RELATIVE_PATH);
}

export function getUserWorkflowDirectory(): string {
  return getDataSubPath("workflows");
}

function isWorkflowFile(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

async function readBuiltInWorkflowDirectory(): Promise<{
  directory: string;
  fileNames: string[];
} | null> {
  const directory = getBuiltInWorkflowDirectory();
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return {
      directory,
      fileNames: entries
        .filter((entry) => entry.isFile() && isWorkflowFile(entry.name))
        .map((entry) => entry.name),
    };
  } catch (error) {
    logger.warn(`[workflow] Failed to read built-in workflow directory: ${directory}`, error);
    return null;
  }
}

export async function listBuiltInWorkflowFileNames(): Promise<string[]> {
  return (await readBuiltInWorkflowDirectory())?.fileNames ?? [];
}

export async function initBuiltInWorkflows(signal?: AbortSignal): Promise<void> {
  try {
    if (signal?.aborted) return;
    const source = await readBuiltInWorkflowDirectory();
    if (!source || signal?.aborted) return;

    const targetDirectory = getUserWorkflowDirectory();
    await fs.mkdir(targetDirectory, { recursive: true });

    await Promise.all(
      source.fileNames.map(async (fileName) => {
        if (signal?.aborted) return;
        const sourcePath = join(source.directory, fileName);
        const targetPath = join(targetDirectory, fileName);

        try {
          await fs.access(targetPath);
          return;
        } catch {
          // Missing target file is expected on first launch.
        }

        try {
          const content = await fs.readFile(sourcePath);
          await writeBuiltInWorkflowAtomically(targetPath, content, signal);
        } catch (error) {
          logger.warn(`[workflow] Failed to initialize built-in workflow: ${fileName}`, error);
        }
      })
    );
  } catch (error) {
    logger.warn("[workflow] Failed to initialize built-in workflows", error);
  }
}
