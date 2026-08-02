import { existsSync } from "fs";
import path from "path";
import type { McpFolderEntry } from "@shared/types/mcp-workspace";
import type { ProposalRef, ResolvedProposalTarget } from "@shared/types/proposal";
import { resolveFolder, validateWorktree } from "../../../shared/workspace-resolver";
import { changeDir } from "../runtime-openspec";
import { runGit } from "./git";

export type ProposalTargetErrorCode =
  | "PROPOSAL_REPOSITORY_INVALID"
  | "PROPOSAL_LOCATION_AMBIGUOUS"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_TARGET_STALE";

export class ProposalTargetError extends Error {
  constructor(
    public readonly code: ProposalTargetErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = "ProposalTargetError";
    Object.freeze(this.details);
  }
}

export interface ProposalTargetDependencies {
  resolveFolder(folderId: string): McpFolderEntry;
  listWorktrees(folderPath: string): Promise<string[]>;
  validateWorktree(folderId: string, worktreePath: string): string;
  changeExists(worktreePath: string, changeId: string): boolean;
}

async function listWorktrees(folderPath: string): Promise<string[]> {
  const result = await runGit(folderPath, ["worktree", "list", "--porcelain"]);
  if (result.exitCode !== 0) {
    throw new ProposalTargetError(
      "PROPOSAL_REPOSITORY_INVALID",
      "Proposal owner Folder must be a readable Git repository",
      { folderPath, stderr: result.stderr.trim() }
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean);
}

const defaultDependencies: ProposalTargetDependencies = {
  resolveFolder,
  listWorktrees,
  validateWorktree,
  changeExists: (worktreePath, changeId) => existsSync(changeDir(worktreePath, changeId)),
};

export async function findProposalTarget(
  proposalRef: ProposalRef,
  dependencies: ProposalTargetDependencies = defaultDependencies
): Promise<ResolvedProposalTarget | null> {
  const folder = dependencies.resolveFolder(proposalRef.folderId);
  const listedPaths = await dependencies.listWorktrees(folder.folderPath);
  const mainPath = dependencies.validateWorktree(proposalRef.folderId, folder.folderPath);
  const candidates = new Map<string, "main" | "linked">([[mainPath, "main"]]);

  for (const listedPath of listedPaths) {
    const worktreePath = dependencies.validateWorktree(proposalRef.folderId, listedPath);
    candidates.set(worktreePath, worktreePath === mainPath ? "main" : "linked");
  }

  const matches = [...candidates]
    .filter(([worktreePath]) => dependencies.changeExists(worktreePath, proposalRef.changeId))
    .map(([worktreePath, worktreeMode]) => ({ proposalRef, worktreeMode, worktreePath }));
  const linkedMatches = matches.filter((candidate) => candidate.worktreeMode === "linked");

  if (linkedMatches.length > 1) {
    throw new ProposalTargetError(
      "PROPOSAL_LOCATION_AMBIGUOUS",
      `Proposal exists in multiple linked worktrees: ${proposalRef.changeId}`,
      {
        proposalRef,
        candidates: linkedMatches.map((candidate) => candidate.worktreePath).sort(),
      }
    );
  }
  if (linkedMatches.length === 1) {
    return linkedMatches[0]!;
  }
  return matches.find((candidate) => candidate.worktreeMode === "main") ?? null;
}

export async function resolveProposalTarget(
  proposalRef: ProposalRef,
  dependencies: ProposalTargetDependencies = defaultDependencies
): Promise<ResolvedProposalTarget> {
  const target = await findProposalTarget(proposalRef, dependencies);
  if (!target) {
    throw new ProposalTargetError(
      "PROPOSAL_NOT_FOUND",
      `Proposal not found: ${proposalRef.changeId}`,
      {
        proposalRef,
      }
    );
  }
  return target;
}

export function validateResolvedProposalTarget(
  target: ResolvedProposalTarget,
  dependencies: Pick<
    ProposalTargetDependencies,
    "validateWorktree" | "changeExists"
  > = defaultDependencies
): ResolvedProposalTarget {
  let worktreePath: string;
  try {
    worktreePath = dependencies.validateWorktree(target.proposalRef.folderId, target.worktreePath);
  } catch (error) {
    throw new ProposalTargetError(
      "PROPOSAL_TARGET_STALE",
      "The proposal worktree is no longer registered for its owner Folder",
      { proposalRef: target.proposalRef, worktreePath: target.worktreePath, cause: String(error) }
    );
  }

  if (!dependencies.changeExists(worktreePath, target.proposalRef.changeId)) {
    throw new ProposalTargetError(
      "PROPOSAL_TARGET_STALE",
      "The fixed proposal target no longer contains the change",
      { proposalRef: target.proposalRef, worktreePath }
    );
  }

  return { ...target, worktreePath: path.resolve(worktreePath) };
}
