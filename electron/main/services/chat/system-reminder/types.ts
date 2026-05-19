import type { SessionOwner } from "@main/services/chat/session-registry";

export interface SystemReminderContext {
  owner: SessionOwner;
  projectPath: string;
  cwd: string;
  fylloSessionId: string;
  agentId: string;
  changeId?: string;
  stageIndex?: number;
  runId?: string;
  worktreePath?: string;
}
