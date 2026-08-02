import { loadFolder } from "@main/infra/storage/folder-store";
import { loadWorkspace } from "@main/infra/storage/workspace-store";
import { encodeProjectPath } from "@main/migrations/legacy-project-path";
import { listLegacyProjects } from "@main/migrations/legacy-project-store";
import type { LegacyProjectMeta } from "@shared/types/project";
import type { FolderMeta, WorkspaceMeta } from "@shared/types/workspace";

export interface WorkspaceCutoverValidationIssue {
  type: "required-migration" | "workspace-target" | "folder-target";
  workspaceId?: string;
  message: string;
}

export interface WorkspaceCutoverTargetValidationDependencies {
  listLegacyProjects(): Promise<LegacyProjectMeta[]>;
  loadWorkspace(workspaceId: string): Promise<WorkspaceMeta | null>;
  loadFolder(folderId: string): Promise<FolderMeta | null>;
}

const defaultDependencies: WorkspaceCutoverTargetValidationDependencies = {
  listLegacyProjects,
  loadWorkspace,
  loadFolder,
};

function matchesMigratedWorkspace(
  project: LegacyProjectMeta,
  workspace: WorkspaceMeta,
  candidateCount: number
): boolean {
  return (
    workspace.id === project.id &&
    workspace.name === project.name &&
    workspace.kind === "folder" &&
    workspace.isDeleted === false &&
    workspace.folderIds.length === 1 &&
    workspace.folderIds[0] === project.id &&
    workspace.primaryFolderId === project.id &&
    workspace.createdAt === project.createdAt &&
    workspace.lastOpenedAt === project.lastOpenedAt &&
    (candidateCount === 1
      ? workspace.legacyAppDataKey === encodeProjectPath(project.path)
      : workspace.legacyAppDataKey === undefined)
  );
}

function matchesMigratedFolder(project: LegacyProjectMeta, folder: FolderMeta): boolean {
  return (
    folder.id === project.id &&
    folder.name === project.name &&
    folder.path.length > 0 &&
    folder.healthScore === project.healthScore
  );
}

export async function validateWorkspaceCutoverTargets(
  dependencies: WorkspaceCutoverTargetValidationDependencies = defaultDependencies
): Promise<WorkspaceCutoverValidationIssue[]> {
  let projects: LegacyProjectMeta[];
  try {
    projects = await dependencies.listLegacyProjects();
  } catch (error) {
    return [
      {
        type: "required-migration",
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  const candidateCounts = new Map<string, number>();
  for (const project of projects) {
    const candidate = encodeProjectPath(project.path);
    candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
  }

  const issues: WorkspaceCutoverValidationIssue[] = [];
  for (const project of projects) {
    try {
      const workspace = await dependencies.loadWorkspace(project.id);
      if (
        !workspace ||
        !matchesMigratedWorkspace(
          project,
          workspace,
          candidateCounts.get(encodeProjectPath(project.path)) ?? 0
        )
      ) {
        issues.push({
          type: "workspace-target",
          workspaceId: project.id,
          message: `Workspace target is missing or inconsistent: ${project.id}`,
        });
      }
    } catch (error) {
      issues.push({
        type: "workspace-target",
        workspaceId: project.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const folder = await dependencies.loadFolder(project.id);
      if (!folder || !matchesMigratedFolder(project, folder)) {
        issues.push({
          type: "folder-target",
          workspaceId: project.id,
          message: `Folder target is missing or inconsistent: ${project.id}`,
        });
      }
    } catch (error) {
      issues.push({
        type: "folder-target",
        workspaceId: project.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return issues;
}
