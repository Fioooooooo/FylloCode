/**
 * Main-process ID factories. Every ID for persisted business objects SHALL
 * be created through these functions so the format can evolve centrally.
 */
import { nanoid } from "nanoid";

function baseId() {
  return nanoid(10);
}

export function newTaskId(): string {
  return `task-${baseId()}`;
}

export function newSessionId(): string {
  return `session-${baseId()}`;
}

export function newRunId(): string {
  return `run-${baseId()}`;
}

export function newArchiveRunId(): string {
  return `archive-${baseId()}`;
}

export function newSubjectId(): string {
  return `subject-${baseId()}`;
}

export function newStageFylloSessionId(runId: string, stageIndex: number): string {
  return `${runId}-${stageIndex}`;
}

export function newArchiveFylloSessionId(runId: string): string {
  return `${runId}-archive`;
}
