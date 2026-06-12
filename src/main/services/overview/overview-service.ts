import { readProposalFiles } from "@main/domain/proposal/openspec-reader";
import logger from "@main/infra/logger";
import { listSubjects } from "@main/infra/storage/lineage-store";
import { getByProposal, listRecentSubjects } from "@main/services/lineage/lineage-service";
import type {
  ActiveChange,
  OverviewChangeStage,
  ProjectOverview,
  RecentThread,
  SpecsGrowthBucket,
} from "@shared/types/overview";
import type { ProposalMeta } from "@shared/types/proposal";
import { getGitGovernance } from "./git-stats";
import { countArchives, countGuidelines, countSpecs } from "./openspec-stats";

type TaskLinkedStats = {
  ratio: number;
  total: number;
};

function mapStage(status: ProposalMeta["status"]): OverviewChangeStage {
  switch (status) {
    case "creating":
      return "drafting";
    case "draft":
      return "proposal";
    case "applying":
      return "applying";
    default:
      logger.warn(`[overview] unknown proposal status ${status}; falling back to drafting`);
      return "drafting";
  }
}

async function computeActiveChanges(projectPath: string): Promise<ActiveChange[]> {
  const proposals = await readProposalFiles(projectPath);
  const activeProposals = proposals.filter((proposal) => proposal.status !== "archived");

  return Promise.all(
    activeProposals.map(async (proposal) => {
      const projection = await getByProposal(projectPath, proposal.id).catch((error: unknown) => {
        logger.warn(
          `[overview] failed to resolve lineage proposal project=${projectPath} change=${proposal.id}`,
          error
        );
        return null;
      });

      return {
        changeName: proposal.id,
        createdAt: proposal.date || null,
        taskTitle: projection?.task?.snapshot.title ?? null,
        taskRef: projection?.task?.ref ?? null,
        stage: mapStage(proposal.status),
      };
    })
  );
}

async function computeTaskLinkedRatio(projectPath: string): Promise<TaskLinkedStats> {
  const subjects = await listSubjects(projectPath);
  const total = subjects.length;
  if (total === 0) {
    return { ratio: 0, total: 0 };
  }

  return {
    // 关联率按"已关联任务"统计而非起源：chat 起源补建任务后应计入，起源不可改写
    ratio: subjects.filter((subject) => subject.task !== null).length / total,
    total,
  };
}

async function computeRecentThreads(
  projectPath: string,
  activeChanges: ActiveChange[]
): Promise<RecentThread[]> {
  const activeChangeIds = new Set(activeChanges.map((change) => change.changeName));
  const subjects = await listRecentSubjects(projectPath, 10);

  return subjects.map((subject) => {
    const proposalCount = subject.links.reduce((total, link) => total + link.proposals.length, 0);
    const hasApplyingChange = subject.links.some((link) =>
      link.proposals.some((proposal) => activeChangeIds.has(proposal.changeId))
    );

    return {
      subjectId: subject.id,
      origin: subject.origin,
      taskRef: subject.task?.ref ?? null,
      taskTitle: subject.task?.snapshot.title ?? null,
      sessionCount: subject.links.length,
      proposalCount,
      mergeCommitSha: null,
      mergeCommitUrl: null,
      mergeStatus: hasApplyingChange ? "applying" : "pending",
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    };
  });
}

function computeSpecsThisMonth(specsGrowth: SpecsGrowthBucket[]): number {
  if (specsGrowth.length === 0) {
    return 0;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const firstCurrentMonthIndex = specsGrowth.findIndex((bucket) =>
    bucket.weekStart.startsWith(currentMonth)
  );
  if (firstCurrentMonthIndex === -1) {
    return 0;
  }

  const previousCount =
    firstCurrentMonthIndex > 0
      ? (specsGrowth[firstCurrentMonthIndex - 1]?.cumulativeCount ?? 0)
      : 0;
  const latestCount = specsGrowth[specsGrowth.length - 1]?.cumulativeCount ?? previousCount;

  return Math.max(0, latestCount - previousCount);
}

export async function getProjectOverview(projectPath: string): Promise<ProjectOverview> {
  const countsPromise = Promise.all([
    countSpecs(projectPath),
    countArchives(projectPath),
    countGuidelines(projectPath),
  ]);
  const taskLinkedPromise = computeTaskLinkedRatio(projectPath);
  const activeChangesPromise = computeActiveChanges(projectPath);
  const governancePromise = getGitGovernance(projectPath);

  const [[specsCount, archiveCounts, guidelinesCount], taskLinked, activeChanges, governance] =
    await Promise.all([countsPromise, taskLinkedPromise, activeChangesPromise, governancePromise]);
  const recentThreads = await computeRecentThreads(projectPath, activeChanges);

  return {
    stats: {
      specsCount,
      specsThisMonth: computeSpecsThisMonth(governance.specsGrowth),
      archiveCount: archiveCounts.total,
      archiveThisMonth: archiveCounts.thisMonth,
      guidelinesCount,
      guidelinesLastUpdated: governance.guidelinesLastUpdated,
      taskLinkedRatio: taskLinked.ratio,
      totalSubjects: taskLinked.total,
    },
    activeChanges,
    recentThreads,
    governance: {
      specsGrowth: governance.specsGrowth,
      recentGuidelines: governance.recentGuidelines,
    },
  };
}
