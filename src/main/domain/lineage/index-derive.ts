import type { LineageIndex, Subject } from "@shared/types/lineage";

export type LineageIndexEntries = Pick<LineageIndex, "tasks" | "sessions" | "proposals">;

const EMPTY_INDEX_UPDATED_AT = new Date(0).toISOString();

export function deriveIndexEntries(subject: Subject): LineageIndexEntries {
  const tasks: Record<string, string> = {};
  const sessions: Record<string, string> = {};
  const proposals: Record<string, string> = {};

  if (subject.task) {
    tasks[subject.task.ref] = subject.id;
  }

  for (const link of subject.links) {
    sessions[link.sessionId] = subject.id;
    for (const proposal of link.proposals) {
      proposals[proposal.changeId] = subject.id;
    }
  }

  return { tasks, sessions, proposals };
}

function latestUpdatedAt(subjects: Subject[]): string {
  let latestTime = Number.NEGATIVE_INFINITY;
  let latest = EMPTY_INDEX_UPDATED_AT;

  for (const subject of subjects) {
    const time = new Date(subject.updatedAt).getTime();
    if (!Number.isNaN(time) && time > latestTime) {
      latestTime = time;
      latest = subject.updatedAt;
    }
  }

  return latest;
}

export function buildIndexFromSubjects(subjects: Subject[]): LineageIndex {
  const index: LineageIndex = {
    version: 1,
    tasks: {},
    sessions: {},
    proposals: {},
    updatedAt: latestUpdatedAt(subjects),
  };

  for (const subject of subjects) {
    const entries = deriveIndexEntries(subject);
    Object.assign(index.tasks, entries.tasks);
    Object.assign(index.sessions, entries.sessions);
    Object.assign(index.proposals, entries.proposals);
  }

  return index;
}
