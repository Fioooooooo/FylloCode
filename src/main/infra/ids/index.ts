/**
 * Main-process ID factories. Every ID for persisted business objects SHALL
 * be created through these functions so the format can evolve centrally.
 */

export function newSessionId(): string {
  return `session-${Date.now()}`;
}

export function newRunId(): string {
  return `run-${Date.now()}`;
}

export function newStageFylloSessionId(runId: string, stageIndex: number): string {
  return `${runId}-${stageIndex}`;
}

export function newArchiveFylloSessionId(runId: string): string {
  return `${runId}-archive`;
}
