import {
  projectProposalOrigin,
  projectSessionLineage,
  projectTaskDownstream,
  type ProposalOriginProjection,
  type SessionLineageProjection,
  type TaskDownstreamProjection,
} from "@main/domain/insight/lineage/projection";
import {
  appendPlan,
  appendProposal,
  attachProposalCommitHash,
  attachTask,
  buildSubject,
  upsertSessionLink,
} from "@main/domain/insight/lineage/subject";
import {
  buildIndexFromSubjects,
  deriveIndexEntries,
} from "@main/domain/insight/lineage/index-derive";
import { newSubjectId } from "@main/infra/ids";
import {
  listSubjects,
  readIndex,
  readSubject,
  writeIndex,
  writeSubject,
} from "@main/infra/storage/lineage-store";
import {
  appendRepositoryLineageRelation,
  readRepositoryLineageIndex,
  RepositoryLineageOriginConflictError,
  type RepositoryLineageObject,
} from "@main/infra/storage/repository-lineage-store";
import { updateSessionOriginTaskRef } from "@main/infra/storage/session-store";
import { createTask } from "@main/services/automation/_public";
import type {
  CreateSessionTaskInput,
  LineageIndex,
  LineageTaskRef,
  LineageTaskSnapshot,
  RepositoryLineageRelation,
  Subject,
} from "@shared/types/lineage";
import { lineageProposalKey } from "@shared/types/lineage";
import type { ProposalRef } from "@shared/types/proposal";
import type { TaskItem } from "@shared/types/task";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyIndex(updatedAt: string): LineageIndex {
  return {
    version: 2,
    tasks: {},
    sessions: {},
    proposals: {},
    commitHashes: {},
    updatedAt,
  };
}

async function readWritableIndex(workspaceId: string, updatedAt: string): Promise<LineageIndex> {
  // Return the existing index, or rebuild it from subjects if it is missing/corrupt.
  return (await readIndex(workspaceId)) ?? rebuildIndex(workspaceId, updatedAt);
}

function removeSubjectEntries(
  entries: Record<string, string>,
  subjectId: string
): Record<string, string> {
  // Strip all entries that point to this subject before re-adding the current ones.
  // This keeps the index consistent when a subject's keys change (e.g. a new commit hash).
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== subjectId));
}

function mergeSubjectIntoIndex(index: LineageIndex, subject: Subject): LineageIndex {
  const entries = deriveIndexEntries(subject);
  return {
    version: 2,
    tasks: {
      ...removeSubjectEntries(index.tasks, subject.id),
      ...entries.tasks,
    },
    sessions: {
      ...removeSubjectEntries(index.sessions, subject.id),
      ...entries.sessions,
    },
    proposals: {
      ...removeSubjectEntries(index.proposals, subject.id),
      ...entries.proposals,
    },
    commitHashes: {
      ...removeSubjectEntries(index.commitHashes, subject.id),
      ...entries.commitHashes,
    },
    updatedAt: subject.updatedAt,
  };
}

async function writeSubjectWithIndex(
  workspaceId: string,
  subject: Subject,
  currentIndex: LineageIndex
): Promise<void> {
  // Persist the subject file first, then update the derived index. The index can always be
  // rebuilt from subjects, so subject integrity takes priority.
  await writeSubject(workspaceId, subject);
  await writeIndex(workspaceId, mergeSubjectIntoIndex(currentIndex, subject));
}

export async function rebuildIndex(
  workspaceId: string,
  emptyUpdatedAt = new Date(0).toISOString()
): Promise<LineageIndex> {
  const subjects = await listSubjects(workspaceId);
  const index = subjects.length > 0 ? buildIndexFromSubjects(subjects) : emptyIndex(emptyUpdatedAt);
  if (subjects.length > 0) {
    await writeIndex(workspaceId, index);
  }
  return index;
}

async function readQueryIndex(workspaceId: string): Promise<LineageIndex> {
  return (await readIndex(workspaceId)) ?? rebuildIndex(workspaceId);
}

async function projectFromIndex<T>(
  workspaceId: string,
  selectSubjectId: (index: LineageIndex) => string | undefined,
  project: (subject: Subject) => T | null
): Promise<T | null> {
  // Look up the subject id in the index, read the subject file, and project the requested view.
  // If the subject file is missing while the index still references it, rebuild the index
  // (which removes stale references) and retry once.
  let index = await readQueryIndex(workspaceId);
  let subjectId = selectSubjectId(index);
  if (!subjectId) {
    return null;
  }

  let subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    index = await rebuildIndex(workspaceId);
    subjectId = selectSubjectId(index);
    subject = subjectId ? await readSubject(workspaceId, subjectId) : null;
  }

  return subject ? project(subject) : null;
}

export async function ensureTaskSubject(
  workspaceId: string,
  taskSnapshot: LineageTaskSnapshot
): Promise<Subject> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const existingSubjectId = index.tasks[taskSnapshot.ref];
  if (existingSubjectId) {
    const existingSubject = await readSubject(workspaceId, existingSubjectId);
    if (existingSubject) {
      return existingSubject;
    }
  }

  const subject = buildSubject("task", taskSnapshot, now, newSubjectId());
  await writeSubjectWithIndex(workspaceId, subject, index);
  return subject;
}

export async function ensureChatSubject(workspaceId: string, sessionId: string): Promise<Subject> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const existingSubjectId = index.sessions[sessionId];
  if (existingSubjectId) {
    const existingSubject = await readSubject(workspaceId, existingSubjectId);
    if (existingSubject) {
      return existingSubject;
    }
  }

  const subject = upsertSessionLink(
    buildSubject("chat", null, now, newSubjectId()),
    sessionId,
    now
  );
  await writeSubjectWithIndex(workspaceId, subject, index);
  return subject;
}

export async function linkSession(
  workspaceId: string,
  sessionId: string,
  subjectId: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const existingSubjectId = index.sessions[sessionId];
  if (existingSubjectId) {
    return readSubject(workspaceId, existingSubjectId);
  }

  const subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = upsertSessionLink(subject, sessionId, now);
  await writeSubjectWithIndex(workspaceId, nextSubject, index);
  return nextSubject;
}

export async function linkTaskSession(
  workspaceId: string,
  taskRef: LineageTaskRef,
  sessionId: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const subjectId = index.tasks[taskRef];
  if (!subjectId) {
    return null;
  }

  return linkSession(workspaceId, sessionId, subjectId);
}

export async function recordProposal(
  workspaceId: string,
  sessionId: string,
  proposalRef: ProposalRef
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const subjectId = index.sessions[sessionId];
  if (!subjectId) {
    return null;
  }

  const subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = appendProposal(subject, sessionId, proposalRef, now);
  await writeSubjectWithIndex(workspaceId, nextSubject, index);
  return nextSubject;
}

export async function recordPlan(
  workspaceId: string,
  sessionId: string,
  slug: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const subjectId = index.sessions[sessionId];
  if (!subjectId) {
    return null;
  }

  const subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = appendPlan(subject, sessionId, slug, now);
  await writeSubjectWithIndex(workspaceId, nextSubject, index);
  return nextSubject;
}

export async function recordProposalCommitHash(
  workspaceId: string,
  proposalRef: ProposalRef,
  commitHash: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const subjectId = index.proposals[lineageProposalKey(proposalRef)];
  if (!subjectId) {
    return null;
  }

  const subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    return null;
  }

  const hasProposal = subject.links.some((link) =>
    link.proposals.some(
      (proposal) =>
        proposal.folderId === proposalRef.folderId && proposal.changeId === proposalRef.changeId
    )
  );
  if (!hasProposal) {
    return null;
  }

  const nextSubject = attachProposalCommitHash(subject, proposalRef, commitHash, now);
  await writeSubjectWithIndex(workspaceId, nextSubject, index);
  return nextSubject;
}

export async function backfillTask(
  workspaceId: string,
  subjectId: string,
  taskSnapshot: LineageTaskSnapshot
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(workspaceId, now);
  const subject = await readSubject(workspaceId, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = attachTask(subject, taskSnapshot);
  await writeSubjectWithIndex(workspaceId, nextSubject, index);
  return nextSubject;
}

export async function createSessionTask(
  workspaceId: string,
  input: CreateSessionTaskInput
): Promise<TaskItem> {
  // 1. Create the actual task through the automation service.
  const task = await createTask(
    workspaceId,
    {
      title: input.title,
      description: {
        format: "plain_text",
        content: input.description ?? "",
      },
    },
    { originSessionId: input.sessionId, actionId: input.actionId }
  );
  const taskSnapshot: LineageTaskSnapshot = {
    ref: `local:${task.id}`,
    snapshot: task,
    capturedAt: nowIso(),
  };

  // 2. Bind the new task to the session's lineage subject.
  // 3. Update the session meta so the chat UI can show the originating task.
  try {
    const existingSubject = await getBySession(workspaceId, input.sessionId);
    const subjectId =
      existingSubject?.subjectId ?? (await ensureChatSubject(workspaceId, input.sessionId)).id;
    const backfilled = await backfillTask(workspaceId, subjectId, taskSnapshot);
    if (!backfilled) {
      throw new Error(
        `[lineage] failed to backfill session task; subject missing workspace=${workspaceId} session=${input.sessionId} task=${task.id}`
      );
    }

    const updated = await updateSessionOriginTaskRef(
      workspaceId,
      input.sessionId,
      taskSnapshot.ref
    );
    if (!updated) {
      throw new Error(
        `[lineage] failed to update session originTaskRef; session missing workspace=${workspaceId} session=${input.sessionId} task=${task.id}`
      );
    }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[lineage] failed to bind session task workspace=${workspaceId} session=${input.sessionId} task=${task.id}: ${reason}`
    );
  }

  return task;
}

export async function getByTask(
  workspaceId: string,
  ref: LineageTaskRef
): Promise<TaskDownstreamProjection | null> {
  return projectFromIndex(
    workspaceId,
    (index) => index.tasks[ref],
    (subject) => projectTaskDownstream(subject)
  );
}

export async function getBySession(
  workspaceId: string,
  sessionId: string
): Promise<SessionLineageProjection | null> {
  return projectFromIndex(
    workspaceId,
    (index) => index.sessions[sessionId],
    (subject) => projectSessionLineage(subject, sessionId)
  );
}

export async function getByProposal(
  workspaceId: string,
  proposalRef: ProposalRef
): Promise<ProposalOriginProjection | null> {
  return projectFromIndex(
    workspaceId,
    (index) => index.proposals[lineageProposalKey(proposalRef)],
    (subject) => projectProposalOrigin(subject, proposalRef)
  );
}

export type RepositoryLineageMutationResult =
  | { status: "recorded" | "unchanged" }
  | { status: "conflict"; existing: RepositoryLineageRelation }
  | { status: "failed"; error: { type: string; message: string } };

export interface RepositoryLineageRelations {
  origin: RepositoryLineageRelation | null;
  references: RepositoryLineageRelation[];
}

async function recordRepositoryRelation(
  folderId: string,
  object: RepositoryLineageObject,
  relation: RepositoryLineageRelation
): Promise<RepositoryLineageMutationResult> {
  try {
    const result = await appendRepositoryLineageRelation(folderId, object, relation);
    return { status: result.changed ? "recorded" : "unchanged" };
  } catch (error) {
    if (error instanceof RepositoryLineageOriginConflictError) {
      return { status: "conflict", existing: error.existing };
    }
    return {
      status: "failed",
      error: {
        type: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function recordRepositoryProposalRelation(
  proposalRef: ProposalRef,
  relation: RepositoryLineageRelation
): Promise<RepositoryLineageMutationResult> {
  return recordRepositoryRelation(
    proposalRef.folderId,
    { kind: "proposal", changeId: proposalRef.changeId },
    relation
  );
}

export function recordRepositoryCommitRelation(
  folderId: string,
  commitHash: string,
  relation: RepositoryLineageRelation
): Promise<RepositoryLineageMutationResult> {
  return recordRepositoryRelation(folderId, { kind: "commit", commitHash }, relation);
}

export async function getRepositoryProposalRelations(
  proposalRef: ProposalRef
): Promise<RepositoryLineageRelations> {
  const index = await readRepositoryLineageIndex(proposalRef.folderId);
  return splitRepositoryRelations(index.proposals[proposalRef.changeId] ?? []);
}

export async function getRepositoryCommitRelations(
  folderId: string,
  commitHash: string
): Promise<RepositoryLineageRelations> {
  const index = await readRepositoryLineageIndex(folderId);
  return splitRepositoryRelations(index.commits[commitHash] ?? []);
}

export type ProposalContinuationResult =
  | { status: "missing-origin" | "same-origin"; subjectId?: string }
  | ({ subjectId: string } & RepositoryLineageMutationResult);

export async function recordProposalContinuation(
  workspaceId: string,
  sessionId: string,
  proposalRef: ProposalRef
): Promise<ProposalContinuationResult> {
  const repository = await getRepositoryProposalRelations(proposalRef);
  if (!repository.origin) {
    return { status: "missing-origin" };
  }

  await ensureChatSubject(workspaceId, sessionId);
  const subject = await recordProposal(workspaceId, sessionId, proposalRef);
  if (!subject) {
    return {
      status: "failed",
      subjectId: "",
      error: { type: "LineageSubjectMissing", message: "Continuation subject is unavailable" },
    };
  }
  if (repository.origin.workspaceId === workspaceId && repository.origin.subjectId === subject.id) {
    return { status: "same-origin", subjectId: subject.id };
  }
  return {
    subjectId: subject.id,
    ...(await recordRepositoryProposalRelation(proposalRef, {
      workspaceId,
      subjectId: subject.id,
      relation: "reference",
      linkedAt: nowIso(),
    })),
  };
}

export async function recordDiscoveredProposalCommit(
  workspaceId: string,
  proposalRef: ProposalRef,
  commitHash: string
): Promise<
  ({ subjectId: string } & RepositoryLineageMutationResult) | { status: "missing-subject" }
> {
  const projection = await getByProposal(workspaceId, proposalRef);
  if (!projection) {
    return { status: "missing-subject" };
  }
  const subject = await recordProposalCommitHash(workspaceId, proposalRef, commitHash);
  if (!subject) {
    return { status: "missing-subject" };
  }
  return {
    subjectId: subject.id,
    ...(await recordRepositoryCommitRelation(proposalRef.folderId, commitHash, {
      workspaceId,
      subjectId: subject.id,
      relation: "origin",
      linkedAt: nowIso(),
    })),
  };
}

function splitRepositoryRelations(
  relations: RepositoryLineageRelation[]
): RepositoryLineageRelations {
  return {
    origin: relations.find((relation) => relation.relation === "origin") ?? null,
    references: relations.filter((relation) => relation.relation === "reference"),
  };
}

export async function listRecentSubjects(workspaceId: string, limit: number): Promise<Subject[]> {
  const subjects = await listSubjects(workspaceId);
  return subjects
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, limit);
}
