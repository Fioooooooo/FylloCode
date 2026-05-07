import { promises as fs } from "fs";
import { basename, join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { encodeProjectPath } from "@main/infra/storage/project-paths";
import type { ProjectInfo, ProjectMeta } from "@shared/types/project";

export type { ProjectMeta };
export { encodeProjectPath };

function projectsDir(): string {
  return getDataSubPath("projects");
}

function projectDir(id: string): string {
  return join(projectsDir(), id);
}

function metaPath(id: string): string {
  return join(projectDir(id), "meta.json");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function parseProjectMeta(raw: string): ProjectMeta {
  return JSON.parse(raw) as ProjectMeta;
}

export function toProjectInfo(meta: ProjectMeta, options?: { pathMissing?: boolean }): ProjectInfo {
  return {
    id: meta.id,
    name: meta.name,
    path: meta.path,
    createdAt: new Date(meta.createdAt),
    lastOpenedAt: new Date(meta.lastOpenedAt),
    pathMissing: options?.pathMissing,
  };
}

export function createProjectMeta(input: {
  id: string;
  name: string;
  path: string;
  createdAt?: Date;
  lastOpenedAt?: Date;
}): ProjectMeta {
  const createdAt = input.createdAt ?? new Date();
  const lastOpenedAt = input.lastOpenedAt ?? createdAt;

  return {
    id: input.id,
    name: input.name,
    path: input.path,
    createdAt: createdAt.toISOString(),
    lastOpenedAt: lastOpenedAt.toISOString(),
  };
}

export async function saveProject(meta: ProjectMeta): Promise<void> {
  await ensureDir(projectDir(meta.id));
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

export async function loadProject(id: string): Promise<ProjectMeta | null> {
  try {
    const content = await fs.readFile(metaPath(id), "utf8");
    return parseProjectMeta(content);
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectMeta[]> {
  try {
    await ensureDir(projectsDir());
    const entries = await fs.readdir(projectsDir(), { withFileTypes: true });
    const metas = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const content = await fs.readFile(metaPath(entry.name), "utf8");
            return parseProjectMeta(content);
          } catch {
            return null;
          }
        })
    );

    return metas.filter((meta): meta is ProjectMeta => meta !== null);
  } catch {
    return [];
  }
}

export async function deleteProject(id: string): Promise<void> {
  await Promise.allSettled([fs.unlink(metaPath(id))]);
}

export function getProjectNameFromPath(projectPath: string): string {
  return basename(projectPath);
}
