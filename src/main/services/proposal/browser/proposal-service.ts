import type { ProposalMeta, ProposalSpecDeltaOverview } from "@shared/types/proposal";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { loadProject } from "@main/infra/storage/project-store";
import { ipcError } from "@main/ipc/_kit/errors";
import { readProposalFiles, readChangeFile } from "@main/infra/proposal/openspec-reader";
import { getProposalSpecDeltas as readProposalSpecDeltas } from "./proposal-spec-delta-service";

// 该层仅做 projectId → projectPath 的解析与错误包装，实际文件扫描在 openspec-reader。
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

export async function getProposalSpecDeltas(
  projectId: string,
  changeId: string
): Promise<ProposalSpecDeltaOverview> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }
  return readProposalSpecDeltas(project.path, changeId);
}
