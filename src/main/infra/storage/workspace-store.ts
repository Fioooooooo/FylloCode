import { promises as fs } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import { workspaceDataDir } from "@main/infra/storage/workspace-paths";
import { validateWorkspaceMeta } from "@main/domain/workspace/model";
import type { WorkspaceMeta } from "@shared/types/workspace";

export function workspacesDir(): string {
  return getDataSubPath("workspaces");
}

export function workspaceDir(workspaceId: string): string {
  return workspaceDataDir(workspaceId);
}

export function workspaceMetaPath(workspaceId: string): string {
  return join(workspaceDir(workspaceId), "meta.json");
}

export async function saveWorkspace(meta: WorkspaceMeta): Promise<void> {
  const validated = validateWorkspaceMeta(meta);
  writeFileAtomicSync(workspaceMetaPath(validated.id), JSON.stringify(validated, null, 2));
}

export async function loadWorkspace(workspaceId: string): Promise<WorkspaceMeta | null> {
  try {
    const raw = await fs.readFile(workspaceMetaPath(workspaceId), "utf8");
    return validateWorkspaceMeta(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  try {
    const entries = await fs.readdir(workspacesDir(), { withFileTypes: true });
    const metas = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => loadWorkspace(entry.name))
    );
    return metas.filter((meta): meta is WorkspaceMeta => meta !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
