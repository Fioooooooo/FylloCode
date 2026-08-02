import { readRepositoryProposalFiles } from "@main/infra/proposal/openspec-reader";
import { listRegisteredWorktreePaths } from "@main/infra/git/worktree-reader";
import { listSubjects } from "@main/infra/storage/lineage-store";
import { resolveWorkspace } from "@main/services/workspace/_public";
import { aggregateWorkspaceRepositories } from "@main/services/insight/repository-browser/aggregate";
import type { Subject } from "@shared/types/lineage";
import type {
  ActiveChange,
  GovernanceEvolution,
  OverviewStats,
  ProjectOverview,
  RecentLineage,
  RepositoryGovernanceSnapshot,
} from "@shared/types/overview";
import { proposalRefKey, type ProposalMeta, type ProposalStatus } from "@shared/types/proposal";
import type { ResolvedWorkspaceFolder } from "@shared/types/workspace";
import { buildArchiveCommitIndex } from "./archive-commit-index";
import { getGitGovernance, type RepositorySpecsGrowthBucket } from "./git-stats";
import { countArchives, countGuidelines, countSpecs } from "./openspec-stats";

type TaskLinkedStats = {
  ratio: number;
  total: number;
};

type ActiveProposalMeta = ProposalMeta & { status: ActiveChange["status"] };

function isActiveProposal(proposal: ProposalMeta): proposal is ActiveProposalMeta {
  return proposal.status !== "archived";
}

function buildSubjectByProposal(subjects: Subject[]): Map<string, Subject> {
  const result = new Map<string, Subject>();
  for (const subject of subjects) {
    for (const link of subject.links) {
      for (const proposal of link.proposals) {
        const key = proposalRefKey({
          folderId: proposal.folderId,
          changeId: proposal.changeId,
        });
        if (!result.has(key)) result.set(key, subject);
      }
    }
  }
  return result;
}

function toActiveChange(
  proposal: ActiveProposalMeta,
  subjectByProposal: Map<string, Subject>
): ActiveChange {
  const subject = subjectByProposal.get(proposalRefKey(proposal.proposalRef));
  return {
    id: proposal.id,
    proposalRef: proposal.proposalRef,
    folderName: proposal.folderName,
    title: proposal.title,
    createdAt: proposal.date || null,
    taskTitle: subject?.task?.snapshot.title ?? null,
    taskRef: subject?.task?.ref ?? null,
    status: proposal.status,
    ...(proposal.worktreePath ? { worktreePath: proposal.worktreePath } : {}),
  };
}

function computeTaskLinkedRatio(subjects: Subject[]): TaskLinkedStats {
  if (subjects.length === 0) return { ratio: 0, total: 0 };
  return {
    ratio: subjects.filter((subject) => subject.task !== null).length / subjects.length,
    total: subjects.length,
  };
}

function deriveLineageStatus(
  rawStatus: ProposalStatus | undefined
): RecentLineage["proposalStatus"] {
  switch (rawStatus) {
    case "creating":
    case "draft":
      return "pending";
    case "applying":
      return "applying";
    case "archived":
      return "completed";
    default:
      return "pending";
  }
}

function resolveLineageStatus(
  proposalStatuses: Array<ProposalStatus | undefined>
): RecentLineage["proposalStatus"] {
  const mapped = proposalStatuses.map(deriveLineageStatus);
  if (mapped.includes("applying")) return "applying";
  if (mapped.includes("pending")) return "pending";
  if (mapped.includes("completed")) return "completed";
  return "pending";
}

function computeSpecsThisMonth(specsGrowth: RepositorySpecsGrowthBucket[]): number {
  if (specsGrowth.length === 0) return 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const firstCurrentMonthIndex = specsGrowth.findIndex((bucket) =>
    bucket.weekStart.startsWith(currentMonth)
  );
  if (firstCurrentMonthIndex === -1) return 0;
  const previousCount =
    firstCurrentMonthIndex > 0
      ? (specsGrowth[firstCurrentMonthIndex - 1]?.cumulativeCount ?? 0)
      : 0;
  const latestCount = specsGrowth.at(-1)?.cumulativeCount ?? previousCount;
  return Math.max(0, latestCount - previousCount);
}

async function readFolderGovernance(
  folder: ResolvedWorkspaceFolder,
  subjectByProposal: Map<string, Subject>
): Promise<{ items: RepositoryGovernanceSnapshot[]; warnings: Array<{ message: string }> }> {
  const registered = await listRegisteredWorktreePaths(folder.folderPath);
  const [proposals, specsCount, archiveCounts, guidelinesCount, governance] = await Promise.all([
    readRepositoryProposalFiles({
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderPath: folder.folderPath,
      registeredWorktreePaths: registered.paths,
    }),
    countSpecs(folder.folderPath),
    countArchives(folder.folderPath),
    countGuidelines(folder.folderPath),
    getGitGovernance(folder.folderPath),
  ]);

  return {
    items: [
      {
        folderId: folder.folderId,
        folderName: folder.folderName,
        stats: {
          specsCount,
          specsThisMonth: computeSpecsThisMonth(governance.specsGrowth),
          archiveCount: archiveCounts.total,
          archiveThisMonth: archiveCounts.thisMonth,
          guidelinesCount,
          guidelinesLastUpdated: governance.guidelinesLastUpdated,
        },
        activeChanges: proposals
          .filter(isActiveProposal)
          .map((proposal) => toActiveChange(proposal, subjectByProposal)),
        proposalStatuses: proposals.map((proposal) => ({
          proposalRef: proposal.proposalRef,
          status: proposal.status,
        })),
        governance: {
          specsGrowth: governance.specsGrowth.map((bucket) => ({
            ...bucket,
            folderId: folder.folderId,
            folderName: folder.folderName,
          })),
          recentGuidelines: governance.recentGuidelines.map((item) => ({
            ...item,
            folderId: folder.folderId,
            folderName: folder.folderName,
          })),
        },
      },
    ],
    warnings: registered.warning ? [{ message: registered.warning }] : [],
  };
}

function buildProposalStatusMap(
  snapshots: RepositoryGovernanceSnapshot[]
): Map<string, ProposalStatus> {
  return new Map(
    snapshots.flatMap((snapshot) =>
      snapshot.proposalStatuses.map(({ proposalRef, status }) => [
        proposalRefKey(proposalRef),
        status,
      ])
    )
  );
}

async function buildArchiveCommitMap(
  subjects: Subject[],
  proposalStatuses: Map<string, ProposalStatus>,
  folderPaths: Map<string, string>
): Promise<Map<string, string>> {
  const requestedByFolder = new Map<string, Set<string>>();
  for (const subject of subjects) {
    for (const proposal of subject.links.flatMap((link) => link.proposals)) {
      const ref = { folderId: proposal.folderId, changeId: proposal.changeId };
      if (
        proposal.commitHash ||
        proposalStatuses.get(proposalRefKey(ref)) !== "archived" ||
        !folderPaths.has(proposal.folderId)
      ) {
        continue;
      }
      const requested = requestedByFolder.get(proposal.folderId) ?? new Set<string>();
      requested.add(proposal.changeId);
      requestedByFolder.set(proposal.folderId, requested);
    }
  }

  const result = new Map<string, string>();
  await Promise.all(
    Array.from(requestedByFolder, async ([folderId, changeIds]) => {
      const index = await buildArchiveCommitIndex(folderPaths.get(folderId)!, changeIds);
      for (const [changeId, commit] of index) {
        result.set(proposalRefKey({ folderId, changeId }), commit.hash);
      }
    })
  );
  return result;
}

async function computeRecentLineages(
  subjects: Subject[],
  snapshots: RepositoryGovernanceSnapshot[],
  folderPaths: Map<string, string>
): Promise<RecentLineage[]> {
  const proposalStatuses = buildProposalStatusMap(snapshots);
  const recentSubjects = [...subjects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
  const archiveCommits = await buildArchiveCommitMap(recentSubjects, proposalStatuses, folderPaths);

  return recentSubjects.map((subject) => {
    const proposals = subject.links.flatMap((link) => link.proposals);
    const statuses = proposals.map((proposal) =>
      proposalStatuses.get(
        proposalRefKey({ folderId: proposal.folderId, changeId: proposal.changeId })
      )
    );
    const hasApplying = statuses.includes("applying");
    const persistedCommit = hasApplying
      ? null
      : (proposals.find((proposal) => proposal.commitHash)?.commitHash ?? null);
    const discoveredCommit = hasApplying
      ? null
      : (proposals
          .map((proposal) =>
            archiveCommits.get(
              proposalRefKey({ folderId: proposal.folderId, changeId: proposal.changeId })
            )
          )
          .find(Boolean) ?? null);

    return {
      subjectId: subject.id,
      origin: subject.origin,
      taskRef: subject.task?.ref ?? null,
      taskTitle: subject.task?.snapshot.title ?? null,
      sessionCount: subject.links.length,
      proposalCount: proposals.length,
      archiveCommitHash: persistedCommit ?? discoveredCommit,
      proposalStatus: resolveLineageStatus(statuses),
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    };
  });
}

function latestDate(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function combineRepositoryStats(
  snapshots: RepositoryGovernanceSnapshot[],
  taskLinked: TaskLinkedStats
): OverviewStats {
  return {
    specsCount: snapshots.reduce((total, item) => total + item.stats.specsCount, 0),
    specsThisMonth: snapshots.reduce((total, item) => total + item.stats.specsThisMonth, 0),
    archiveCount: snapshots.reduce((total, item) => total + item.stats.archiveCount, 0),
    archiveThisMonth: snapshots.reduce((total, item) => total + item.stats.archiveThisMonth, 0),
    guidelinesCount: snapshots.reduce((total, item) => total + item.stats.guidelinesCount, 0),
    guidelinesLastUpdated: latestDate(snapshots.map((item) => item.stats.guidelinesLastUpdated)),
    taskLinkedRatio: taskLinked.ratio,
    totalSubjects: taskLinked.total,
  };
}

function combineGovernance(snapshots: RepositoryGovernanceSnapshot[]): GovernanceEvolution {
  return {
    specsGrowth: snapshots.flatMap((snapshot) => snapshot.governance.specsGrowth),
    recentGuidelines: snapshots
      .flatMap((snapshot) => snapshot.governance.recentGuidelines)
      .sort((left, right) => right.lastCommitDate.localeCompare(left.lastCommitDate))
      .slice(0, 5),
  };
}

export async function getProjectOverview(workspaceId: string): Promise<ProjectOverview> {
  const workspace = await resolveWorkspace(workspaceId);
  const subjects = await listSubjects(workspaceId);
  const subjectByProposal = buildSubjectByProposal(subjects);
  const repository = await aggregateWorkspaceRepositories(workspace, (folder) =>
    readFolderGovernance(folder, subjectByProposal)
  );
  const taskLinked = computeTaskLinkedRatio(subjects);
  const folderPaths = new Map(
    repository.folders
      .filter((folder) => folder.status === "ready")
      .map((folder) => [folder.folderId, folder.folderPath])
  );

  return {
    stats: combineRepositoryStats(repository.items, taskLinked),
    activeChanges: repository.items
      .flatMap((snapshot) => snapshot.activeChanges)
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")),
    recentLineages: await computeRecentLineages(subjects, repository.items, folderPaths),
    governance: combineGovernance(repository.items),
    repository,
  };
}
