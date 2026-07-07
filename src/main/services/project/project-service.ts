import { promises as fs } from "fs";
import type { ProjectInfo, ProjectMeta } from "@shared/types/project";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { expandHomePath } from "@main/infra/paths";
import {
  createProjectMeta,
  deleteProject as deleteProjectStore,
  encodeProjectPath,
  getProjectNameFromPath,
  listProjects as listProjectMetas,
  loadProject,
  saveProject,
  toProjectInfo,
} from "@main/infra/storage/project-store";
import { ipcError } from "@main/ipc/_kit/errors";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function toProjectInfoWithPathStatus(meta: ProjectMeta): Promise<ProjectInfo> {
  const missing = !(await pathExists(meta.path));
  return toProjectInfo(meta, { pathMissing: missing || undefined });
}

export async function listProjects(): Promise<ProjectInfo[]> {
  const metas = await listProjectMetas();
  return Promise.all(
    metas
      .sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())
      .map((meta) => toProjectInfoWithPathStatus(meta))
  );
}

export async function getProject(id: string): Promise<ProjectInfo | null> {
  const meta = await loadProject(id);
  if (!meta) return null;
  return toProjectInfoWithPathStatus(meta);
}

export async function getRequiredProject(id: string): Promise<ProjectInfo> {
  const project = await getProject(id);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${id}`);
  }
  return project;
}

export async function updateProject(input: {
  id: string;
  patch: {
    name?: string;
    path?: string;
    healthScore?: number;
    createdAt?: Date | string;
    lastOpenedAt?: Date | string;
    pathMissing?: boolean;
  };
}): Promise<ProjectInfo> {
  const existing = await loadProject(input.id);
  if (!existing) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${input.id}`);
  }

  const nextMeta = createProjectMeta({
    id: existing.id,
    name: input.patch.name ?? existing.name,
    path: input.patch.path ? expandHomePath(input.patch.path) : existing.path,
    healthScore: input.patch.healthScore ?? existing.healthScore,
    createdAt: input.patch.createdAt
      ? new Date(input.patch.createdAt)
      : new Date(existing.createdAt),
    lastOpenedAt: input.patch.lastOpenedAt
      ? new Date(input.patch.lastOpenedAt)
      : new Date(existing.lastOpenedAt),
  });
  await saveProject(nextMeta);
  return toProjectInfo(nextMeta);
}

export async function removeProject(id: string): Promise<void> {
  await deleteProjectStore(id);
}

export async function touchProjectLastOpened(id: string): Promise<ProjectInfo> {
  const existing = await loadProject(id);
  if (!existing) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${id}`);
  }

  const nextMeta = createProjectMeta({
    id: existing.id,
    name: existing.name,
    path: existing.path,
    healthScore: existing.healthScore,
    createdAt: new Date(existing.createdAt),
    lastOpenedAt: new Date(),
  });
  await saveProject(nextMeta);
  return toProjectInfoWithPathStatus(nextMeta);
}

export async function adoptExistingFolder(projectPath: string): Promise<ProjectInfo> {
  const id = encodeProjectPath(projectPath);
  const existing = await loadProject(id);
  const meta = createProjectMeta({
    id,
    name: existing?.name ?? getProjectNameFromPath(projectPath),
    path: projectPath,
    healthScore: existing?.healthScore,
    createdAt: existing ? new Date(existing.createdAt) : new Date(),
    lastOpenedAt: new Date(),
  });
  await saveProject(meta);
  return toProjectInfoWithPathStatus(meta);
}
