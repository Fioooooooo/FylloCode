import type { ProposalMeta } from "@shared/types/proposal";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { loadProject } from "@main/infra/storage/project-store";
import { ipcError } from "@main/ipc/_kit/errors";
import { readProposalFiles, readChangeFile } from "@main/domain/proposal/openspec-reader";

export async function listProposals(projectId: string): Promise<ProposalMeta[]> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return readProposalFiles(project.path);
}

export async function readProposalFile(
  projectId: string,
  changeId: string,
  filename: string
): Promise<string | null> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return readChangeFile(project.path, changeId, filename);
}
