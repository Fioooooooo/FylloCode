import type { LineageIndex, Subject } from "@shared/types/lineage";

export type LineageIndexEntries = Pick<
  LineageIndex,
  "tasks" | "sessions" | "proposals" | "commitHashes"
>;

const EMPTY_INDEX_UPDATED_AT = new Date(0).toISOString();

/**
 * Derive the inverse lookup entries for a single subject.
 *
 * The lineage index is a derived view: it maps task refs, session ids, proposal change ids,
 * and commit hashes back to the subject that owns them. This lets callers find a subject
 * without scanning every subject file.
 */
export function deriveIndexEntries(subject: Subject): LineageIndexEntries {
  const tasks: Record<string, string> = {};
  const sessions: Record<string, string> = {};
  const proposals: Record<string, string> = {};
  const commitHashes: Record<string, string> = {};

  if (subject.task) {
    tasks[subject.task.ref] = subject.id;
  }

  for (const link of subject.links) {
    sessions[link.sessionId] = subject.id;
    for (const proposal of link.proposals) {
      proposals[proposal.changeId] = subject.id;
      if (typeof proposal.commitHash === "string" && proposal.commitHash.length > 0) {
        commitHashes[proposal.commitHash] = subject.id;
      }
    }
  }

  return { tasks, sessions, proposals, commitHashes };
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

/**
 * Build a complete lineage index from all subjects in the project.
 *
 * The index version is bumped manually when the format changes. `updatedAt` is the most
 * recent `subject.updatedAt`, so callers can compare the index freshness with subject files.
 */
export function buildIndexFromSubjects(subjects: Subject[]): LineageIndex {
  const index: LineageIndex = {
    version: 1,
    tasks: {},
    sessions: {},
    proposals: {},
    commitHashes: {},
    updatedAt: latestUpdatedAt(subjects),
  };

  for (const subject of subjects) {
    const entries = deriveIndexEntries(subject);
    Object.assign(index.tasks, entries.tasks);
    Object.assign(index.sessions, entries.sessions);
    Object.assign(index.proposals, entries.proposals);
    Object.assign(index.commitHashes, entries.commitHashes);
  }

  return index;
}
