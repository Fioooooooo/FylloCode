import type { LineageOrigin, LineageTaskSnapshot, Subject } from "@shared/types/lineage";

function defaultSubjectId(now: string): string {
  const time = new Date(now).getTime();
  return `subject-${Number.isNaN(time) ? 0 : time}`;
}

export function buildSubject(
  origin: LineageOrigin,
  task: LineageTaskSnapshot | null,
  now: string,
  subjectId = defaultSubjectId(now)
): Subject {
  return {
    id: subjectId,
    origin,
    task,
    links: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertSessionLink(subject: Subject, sessionId: string, now: string): Subject {
  // Return the same reference when nothing changes so callers can detect mutations by reference equality.
  if (subject.links.some((link) => link.sessionId === sessionId)) {
    return subject;
  }

  return {
    ...subject,
    links: [
      ...subject.links,
      {
        sessionId,
        createdAt: now,
        proposals: [],
        plans: [],
      },
    ],
    updatedAt: now,
  };
}

export function appendProposal(
  subject: Subject,
  sessionId: string,
  changeId: string,
  now: string
): Subject {
  const targetLink = subject.links.find((link) => link.sessionId === sessionId);
  // Idempotent: a proposal is recorded only once per session link.
  if (!targetLink || targetLink.proposals.some((proposal) => proposal.changeId === changeId)) {
    return subject;
  }

  return {
    ...subject,
    links: subject.links.map((link) =>
      link.sessionId === sessionId
        ? {
            ...link,
            proposals: [
              ...link.proposals,
              {
                changeId,
                createdAt: now,
              },
            ],
          }
        : link
    ),
    updatedAt: now,
  };
}

export function appendPlan(
  subject: Subject,
  sessionId: string,
  slug: string,
  now: string
): Subject {
  const targetLink = subject.links.find((link) => link.sessionId === sessionId);
  // Idempotent: a plan is recorded only once per session link.
  if (!targetLink || targetLink.plans.some((plan) => plan.slug === slug)) {
    return subject;
  }

  return {
    ...subject,
    links: subject.links.map((link) =>
      link.sessionId === sessionId
        ? {
            ...link,
            plans: [
              ...link.plans,
              {
                slug,
                createdAt: now,
              },
            ],
          }
        : link
    ),
    updatedAt: now,
  };
}

export function attachProposalCommitHash(
  subject: Subject,
  changeId: string,
  commitHash: string,
  now: string
): Subject {
  if (commitHash.length === 0) {
    return subject;
  }

  // Attach the commit hash to the first matching proposal that does not already have one.
  // Once a commit hash is set it is immutable, so return the same reference if unchanged.
  let changed = false;
  const links = subject.links.map((link) => ({
    ...link,
    proposals: link.proposals.map((proposal) => {
      if (proposal.changeId !== changeId) {
        return proposal;
      }

      if (proposal.commitHash === commitHash) {
        return proposal;
      }

      if (typeof proposal.commitHash === "string" && proposal.commitHash.length > 0) {
        return proposal;
      }

      changed = true;
      return {
        ...proposal,
        commitHash,
      };
    }),
  }));

  if (!changed) {
    return subject;
  }

  return {
    ...subject,
    links,
    updatedAt: now,
  };
}

export function attachTask(subject: Subject, taskSnapshot: LineageTaskSnapshot): Subject {
  // Idempotent: only update if the task reference actually changed.
  if (subject.task?.ref === taskSnapshot.ref) {
    return subject;
  }

  return {
    ...subject,
    task: taskSnapshot,
    updatedAt: taskSnapshot.capturedAt,
  };
}
