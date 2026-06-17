import {
  projectProposalOrigin,
  projectSessionLineage,
  projectTaskDownstream,
  type ProposalOriginProjection,
  type SessionLineageProjection,
  type TaskDownstreamProjection,
} from "@main/domain/lineage/projection";
import {
  appendProposal,
  attachProposalCommitHash,
  attachTask,
  buildSubject,
  upsertSessionLink,
} from "@main/domain/lineage/subject";
import { buildIndexFromSubjects, deriveIndexEntries } from "@main/domain/lineage/index-derive";
import { newSubjectId } from "@main/infra/ids";
import {
  listSubjects,
  readIndex,
  readSubject,
  writeIndex,
  writeSubject,
} from "@main/infra/storage/lineage-store";
import { updateSessionOriginTaskRef } from "@main/infra/storage/session-store";
import { createTask } from "@main/services/task/task-service";
import type {
  CreateSessionTaskInput,
  LineageIndex,
  LineageTaskRef,
  LineageTaskSnapshot,
  Subject,
} from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyIndex(updatedAt: string): LineageIndex {
  return {
    version: 1,
    tasks: {},
    sessions: {},
    proposals: {},
    commitHashes: {},
    updatedAt,
  };
}

async function readWritableIndex(projectPath: string, updatedAt: string): Promise<LineageIndex> {
  return (await readIndex(projectPath)) ?? rebuildIndex(projectPath, updatedAt);
}

function removeSubjectEntries(
  entries: Record<string, string>,
  subjectId: string
): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== subjectId));
}

function mergeSubjectIntoIndex(index: LineageIndex, subject: Subject): LineageIndex {
  const entries = deriveIndexEntries(subject);
  return {
    version: 1,
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
  projectPath: string,
  subject: Subject,
  currentIndex: LineageIndex
): Promise<void> {
  await writeSubject(projectPath, subject);
  await writeIndex(projectPath, mergeSubjectIntoIndex(currentIndex, subject));
}

export async function rebuildIndex(
  projectPath: string,
  emptyUpdatedAt = new Date(0).toISOString()
): Promise<LineageIndex> {
  const subjects = await listSubjects(projectPath);
  const index = subjects.length > 0 ? buildIndexFromSubjects(subjects) : emptyIndex(emptyUpdatedAt);
  if (subjects.length > 0) {
    await writeIndex(projectPath, index);
  }
  return index;
}

async function readQueryIndex(projectPath: string): Promise<LineageIndex> {
  return (await readIndex(projectPath)) ?? rebuildIndex(projectPath);
}

async function projectFromIndex<T>(
  projectPath: string,
  selectSubjectId: (index: LineageIndex) => string | undefined,
  project: (subject: Subject) => T | null
): Promise<T | null> {
  let index = await readQueryIndex(projectPath);
  let subjectId = selectSubjectId(index);
  if (!subjectId) {
    return null;
  }

  let subject = await readSubject(projectPath, subjectId);
  if (!subject) {
    index = await rebuildIndex(projectPath);
    subjectId = selectSubjectId(index);
    subject = subjectId ? await readSubject(projectPath, subjectId) : null;
  }

  return subject ? project(subject) : null;
}

export async function ensureTaskSubject(
  projectPath: string,
  taskSnapshot: LineageTaskSnapshot
): Promise<Subject> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const existingSubjectId = index.tasks[taskSnapshot.ref];
  if (existingSubjectId) {
    const existingSubject = await readSubject(projectPath, existingSubjectId);
    if (existingSubject) {
      return existingSubject;
    }
  }

  const subject = buildSubject("task", taskSnapshot, now, newSubjectId());
  await writeSubjectWithIndex(projectPath, subject, index);
  return subject;
}

export async function ensureChatSubject(projectPath: string, sessionId: string): Promise<Subject> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const existingSubjectId = index.sessions[sessionId];
  if (existingSubjectId) {
    const existingSubject = await readSubject(projectPath, existingSubjectId);
    if (existingSubject) {
      return existingSubject;
    }
  }

  const subject = upsertSessionLink(
    buildSubject("chat", null, now, newSubjectId()),
    sessionId,
    now
  );
  await writeSubjectWithIndex(projectPath, subject, index);
  return subject;
}

export async function linkSession(
  projectPath: string,
  sessionId: string,
  subjectId: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const existingSubjectId = index.sessions[sessionId];
  if (existingSubjectId) {
    return readSubject(projectPath, existingSubjectId);
  }

  const subject = await readSubject(projectPath, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = upsertSessionLink(subject, sessionId, now);
  await writeSubjectWithIndex(projectPath, nextSubject, index);
  return nextSubject;
}

export async function linkTaskSession(
  projectPath: string,
  taskRef: LineageTaskRef,
  sessionId: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const subjectId = index.tasks[taskRef];
  if (!subjectId) {
    return null;
  }

  return linkSession(projectPath, sessionId, subjectId);
}

export async function recordProposal(
  projectPath: string,
  sessionId: string,
  changeId: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const subjectId = index.sessions[sessionId];
  if (!subjectId) {
    return null;
  }

  const subject = await readSubject(projectPath, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = appendProposal(subject, sessionId, changeId, now);
  await writeSubjectWithIndex(projectPath, nextSubject, index);
  return nextSubject;
}

export async function recordProposalCommitHash(
  projectPath: string,
  changeId: string,
  commitHash: string
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const subjectId = index.proposals[changeId];
  if (!subjectId) {
    return null;
  }

  const subject = await readSubject(projectPath, subjectId);
  if (!subject) {
    return null;
  }

  const hasProposal = subject.links.some((link) =>
    link.proposals.some((proposal) => proposal.changeId === changeId)
  );
  if (!hasProposal) {
    return null;
  }

  const nextSubject = attachProposalCommitHash(subject, changeId, commitHash, now);
  await writeSubjectWithIndex(projectPath, nextSubject, index);
  return nextSubject;
}

export async function backfillTask(
  projectPath: string,
  subjectId: string,
  taskSnapshot: LineageTaskSnapshot
): Promise<Subject | null> {
  const now = nowIso();
  const index = await readWritableIndex(projectPath, now);
  const subject = await readSubject(projectPath, subjectId);
  if (!subject) {
    return null;
  }

  const nextSubject = attachTask(subject, taskSnapshot);
  await writeSubjectWithIndex(projectPath, nextSubject, index);
  return nextSubject;
}

export async function createSessionTask(
  projectPath: string,
  input: CreateSessionTaskInput
): Promise<TaskItem> {
  const task = await createTask(
    projectPath,
    {
      title: input.title,
      description: {
        format: "plain_text",
        content: input.description ?? "",
      },
    },
    { originSessionId: input.sessionId }
  );
  const taskSnapshot: LineageTaskSnapshot = {
    ref: `local:${task.id}`,
    snapshot: task,
    capturedAt: nowIso(),
  };

  try {
    const existingSubject = await getBySession(projectPath, input.sessionId);
    const subjectId =
      existingSubject?.subjectId ?? (await ensureChatSubject(projectPath, input.sessionId)).id;
    const backfilled = await backfillTask(projectPath, subjectId, taskSnapshot);
    if (!backfilled) {
      throw new Error(
        `[lineage] failed to backfill session task; subject missing project=${projectPath} session=${input.sessionId} task=${task.id}`
      );
    }

    const updated = await updateSessionOriginTaskRef(
      projectPath,
      input.sessionId,
      taskSnapshot.ref
    );
    if (!updated) {
      throw new Error(
        `[lineage] failed to update session originTaskRef; session missing project=${projectPath} session=${input.sessionId} task=${task.id}`
      );
    }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[lineage] failed to bind session task project=${projectPath} session=${input.sessionId} task=${task.id}: ${reason}`
    );
  }

  return task;
}

export async function getByTask(
  projectPath: string,
  ref: LineageTaskRef
): Promise<TaskDownstreamProjection | null> {
  return projectFromIndex(
    projectPath,
    (index) => index.tasks[ref],
    (subject) => projectTaskDownstream(subject)
  );
}

export async function getBySession(
  projectPath: string,
  sessionId: string
): Promise<SessionLineageProjection | null> {
  return projectFromIndex(
    projectPath,
    (index) => index.sessions[sessionId],
    (subject) => projectSessionLineage(subject, sessionId)
  );
}

export async function getByProposal(
  projectPath: string,
  changeId: string
): Promise<ProposalOriginProjection | null> {
  return projectFromIndex(
    projectPath,
    (index) => index.proposals[changeId],
    (subject) => projectProposalOrigin(subject, changeId)
  );
}

export async function listRecentSubjects(projectPath: string, limit: number): Promise<Subject[]> {
  const subjects = await listSubjects(projectPath);
  return subjects
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, limit);
}
