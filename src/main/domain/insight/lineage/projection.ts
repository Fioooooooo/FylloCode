import type {
  LineageOrigin,
  LineageProposalLink,
  LineageSessionLink,
  LineageTaskSnapshot,
  Subject,
} from "@shared/types/lineage";

export type TaskDownstreamProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  links: LineageSessionLink[];
};

export type SessionLineageProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  session: LineageSessionLink;
};

export type ProposalOriginProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  sessionId: string;
  proposal: LineageProposalLink;
};

function cloneSessionLink(link: LineageSessionLink): LineageSessionLink {
  return {
    ...link,
    proposals: link.proposals.map((proposal) => ({ ...proposal })),
    plans: link.plans.map((plan) => ({ ...plan })),
  };
}

export function projectTaskDownstream(subject: Subject): TaskDownstreamProjection {
  return {
    subjectId: subject.id,
    origin: subject.origin,
    task: subject.task,
    links: subject.links.map((link) => cloneSessionLink(link)),
  };
}

export function projectSessionLineage(
  subject: Subject,
  sessionId: string
): SessionLineageProjection | null {
  const session = subject.links.find((link) => link.sessionId === sessionId);
  if (!session) {
    return null;
  }

  return {
    subjectId: subject.id,
    origin: subject.origin,
    task: subject.task,
    session: cloneSessionLink(session),
  };
}

export function projectProposalOrigin(
  subject: Subject,
  changeId: string
): ProposalOriginProjection | null {
  for (const link of subject.links) {
    const proposal = link.proposals.find((item) => item.changeId === changeId);
    if (proposal) {
      return {
        subjectId: subject.id,
        origin: subject.origin,
        task: subject.task,
        sessionId: link.sessionId,
        proposal: { ...proposal },
      };
    }
  }

  return null;
}
