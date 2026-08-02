import type { ProposalMeta, ProposalSpecDeltaOverview } from "@shared/types/proposal";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { readProposalFiles, readChangeFile } from "@main/infra/proposal/openspec-reader";
import { getProposalSpecDeltas as readProposalSpecDeltas } from "./proposal-spec-delta-service";

// 该层仅做 workspaceId → Workspace cwd 的解析，实际文件扫描在 openspec-reader。
export async function listProposals(workspaceId: string): Promise<ProposalMeta[]> {
  return readProposalFiles((await resolveWorkspace(workspaceId)).cwd);
}

export async function readProposalFile(
  workspaceId: string,
  changeId: string,
  filename: string
): Promise<string | null> {
  return readChangeFile((await resolveWorkspace(workspaceId)).cwd, changeId, filename);
}

export async function getProposalSpecDeltas(
  workspaceId: string,
  changeId: string
): Promise<ProposalSpecDeltaOverview> {
  return readProposalSpecDeltas((await resolveWorkspace(workspaceId)).cwd, changeId);
}
