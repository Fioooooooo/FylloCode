import { ipcMain, dialog } from "electron";
import { homedir } from "os";
import { join } from "path";
import { ProjectChannels } from "@shared/types/channels";
import type { ProjectInfo, ProjectMeta } from "@shared/types/project";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  createProjectInputSchema,
  getByIdInputSchema,
  removeProjectInputSchema,
  updateProjectInputSchema,
} from "@shared/schemas/ipc/project";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import {
  createProjectMeta,
  deleteProject,
  encodeProjectPath,
  getProjectNameFromPath,
  listProjects,
  loadProject,
  saveProject,
  toProjectInfo,
} from "@main/services/project-store";
import { promises as fs } from "fs";

function expandHomePath(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }

  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

async function pathExists(targetPath: string): Promise<boolean> {
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

export function registerProjectHandlers(): void {
  ipcMain.handle(ProjectChannels.list, () =>
    wrapHandler(async () => {
      const metas = await listProjects();
      return metas
        .sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime())
        .map((meta) => toProjectInfo(meta));
    })
  );

  ipcMain.handle(ProjectChannels.getById, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(getByIdInputSchema, input);
      const meta = await loadProject(id);
      if (!meta) {
        return null;
      }

      return toProjectInfoWithPathStatus(meta);
    })
  );

  ipcMain.handle(ProjectChannels.getDefaultPath, () =>
    wrapHandler(async () => {
      return homedir();
    })
  );

  ipcMain.handle(ProjectChannels.create, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(createProjectInputSchema, input);
      const basePath = expandHomePath(form.path);
      const projectPath = join(basePath, form.name);
      const id = encodeProjectPath(projectPath);
      const existing = await loadProject(id);

      await fs.mkdir(projectPath, { recursive: true });

      const meta = createProjectMeta({
        id,
        name: form.name,
        path: projectPath,
        createdAt: existing ? new Date(existing.createdAt) : undefined,
        lastOpenedAt: new Date(),
      });

      await saveProject(meta);
      return toProjectInfo(meta);
    })
  );

  ipcMain.handle(ProjectChannels.update, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id, patch } = validate(updateProjectInputSchema, input);
      const existing = await loadProject(id);
      if (!existing) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${id}`);
      }

      const nextMeta = createProjectMeta({
        id: existing.id,
        name: patch.name ?? existing.name,
        path: patch.path ? expandHomePath(patch.path) : existing.path,
        createdAt: patch.createdAt ? new Date(patch.createdAt) : new Date(existing.createdAt),
        lastOpenedAt: patch.lastOpenedAt
          ? new Date(patch.lastOpenedAt)
          : new Date(existing.lastOpenedAt),
      });

      await saveProject(nextMeta);
      return toProjectInfo(nextMeta);
    })
  );

  ipcMain.handle(ProjectChannels.remove, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { id } = validate(removeProjectInputSchema, input);
      await deleteProject(id);
    })
  );

  ipcMain.handle(ProjectChannels.openFolder, () =>
    wrapHandler(async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const projectPath = result.filePaths[0];
      const id = encodeProjectPath(projectPath);
      const existing = await loadProject(id);
      const meta = createProjectMeta({
        id,
        name: existing?.name ?? getProjectNameFromPath(projectPath),
        path: projectPath,
        createdAt: existing ? new Date(existing.createdAt) : new Date(),
        lastOpenedAt: new Date(),
      });

      await saveProject(meta);
      return toProjectInfoWithPathStatus(meta);
    })
  );
}
