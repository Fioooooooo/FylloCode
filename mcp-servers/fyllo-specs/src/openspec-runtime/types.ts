export interface ChangeSummary {
  name: string;
  completedTasks: number;
  totalTasks: number;
  lastModified: string;
  status: string;
}

export interface ArtifactStatus {
  id: string;
  outputPath: string;
  status: string;
}

export interface InstructionPayload {
  template?: string;
  outputPath?: string;
  dependencies?: string[];
  instruction?: string;
}

export interface ArchiveResult {
  changeName: string;
  archiveTarget: string;
  conflicts: string[];
  deltaSpecSummary: { files: string[] } | null;
  archiveRawOutput: string | null;
}

export interface ApplyStateResult {
  changeName: string;
  schemaName: string;
  applyState: "ready" | "blocked" | "all_done";
  contextFiles: Record<string, string[]>;
  tasks: Array<{ line: number; text: string; done: boolean }>;
  progress: { total: number; complete: number; remaining: number };
}

export class OpenspecCliError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode: number
  ) {
    super(message);
    this.name = "OpenspecCliError";
  }
}

export class OpenspecTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenspecTimeoutError";
  }
}
