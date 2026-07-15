import { readProposalFiles, stripArchivePrefix } from "@main/infra/proposal/openspec-reader";
import { listSubjects } from "@main/infra/storage/lineage-store";
import { listSessionMetas } from "@main/infra/storage/session-store";
import type {
  LineageBrowserData,
  LineageBrowserEntry,
  LineageBrowserPlan,
  LineageBrowserProposal,
  LineageBrowserSession,
  LineageBrowserStatus,
  LineagePlanLink,
  LineageProposalLink,
  LineageSessionLink,
  Subject,
} from "@shared/types/lineage";
import type { ProposalMeta, ProposalStatus } from "@shared/types/proposal";
import { readPlan } from "./plan";

export function deriveLineageBrowserStatus(
  proposalStatuses: Array<ProposalStatus | null>,
  planCount: number
): LineageBrowserStatus {
  if (proposalStatuses.includes("applying")) {
    return "applying";
  }

  if (
    proposalStatuses.some(
      (status) => status === "creating" || status === "draft" || status === null
    )
  ) {
    return "planned";
  }

  if (proposalStatuses.length > 0 && proposalStatuses.every((status) => status === "archived")) {
    return "completed";
  }

  return planCount > 0 ? "planned" : "discussion";
}

function buildProposalMap(proposals: ProposalMeta[]): Map<string, ProposalMeta> {
  return new Map(proposals.map((proposal) => [stripArchivePrefix(proposal.id), proposal]));
}

async function projectPlan(
  projectPath: string,
  sessionId: string,
  link: LineagePlanLink
): Promise<LineageBrowserPlan> {
  try {
    const document = await readPlan(projectPath, sessionId, link.slug);
    return {
      slug: link.slug,
      createdAt: link.createdAt,
      goal: document.goal,
      status: document.status,
    };
  } catch {
    return {
      slug: link.slug,
      createdAt: link.createdAt,
      goal: null,
      status: null,
    };
  }
}

function projectProposal(
  link: LineageProposalLink,
  proposalMap: Map<string, ProposalMeta>
): LineageBrowserProposal {
  const proposal = proposalMap.get(link.changeId);
  return {
    changeId: link.changeId,
    createdAt: link.createdAt,
    commitHash: link.commitHash ?? null,
    title: proposal?.title ?? null,
    status: proposal?.status ?? null,
  };
}

async function projectSession(
  projectPath: string,
  link: LineageSessionLink,
  sessionMap: Map<string, Awaited<ReturnType<typeof listSessionMetas>>[number]>,
  proposalMap: Map<string, ProposalMeta>
): Promise<LineageBrowserSession> {
  const meta = sessionMap.get(link.sessionId);
  const plans = await Promise.all(
    link.plans.map((plan) => projectPlan(projectPath, link.sessionId, plan))
  );

  return {
    sessionId: link.sessionId,
    title: meta?.title || link.sessionId,
    agentId: meta?.agentId ?? null,
    createdAt: link.createdAt,
    updatedAt: meta?.updatedAt ?? link.createdAt,
    plans,
    proposals: link.proposals.map((proposal) => projectProposal(proposal, proposalMap)),
  };
}

async function projectSubject(
  projectPath: string,
  subject: Subject,
  sessionMap: Map<string, Awaited<ReturnType<typeof listSessionMetas>>[number]>,
  proposalMap: Map<string, ProposalMeta>
): Promise<LineageBrowserEntry> {
  const sessions = await Promise.all(
    subject.links.map((link) => projectSession(projectPath, link, sessionMap, proposalMap))
  );
  const proposalStatuses = sessions.flatMap((session) =>
    session.proposals.map((proposal) => proposal.status)
  );
  const planCount = sessions.reduce((total, session) => total + session.plans.length, 0);

  return {
    subjectId: subject.id,
    origin: subject.origin,
    task: subject.task,
    status: deriveLineageBrowserStatus(proposalStatuses, planCount),
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
    sessions,
  };
}

export async function getLineageBrowser(projectPath: string): Promise<LineageBrowserData> {
  const [subjects, sessionMetas, proposals] = await Promise.all([
    listSubjects(projectPath),
    listSessionMetas(projectPath),
    readProposalFiles(projectPath),
  ]);
  const sessionMap = new Map(sessionMetas.map((session) => [session.sessionId, session]));
  const proposalMap = buildProposalMap(proposals);
  const entries = await Promise.all(
    subjects.map((subject) => projectSubject(projectPath, subject, sessionMap, proposalMap))
  );

  return {
    entries: entries.sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ),
  };
}
