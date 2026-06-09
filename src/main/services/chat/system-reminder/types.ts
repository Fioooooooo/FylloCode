import type { SessionOwner } from "@main/services/chat/session-registry";
import type { LineageTaskRef } from "@shared/types/lineage";

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
  taskRef?: LineageTaskRef;
}
