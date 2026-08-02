import type { SessionOwner } from "@main/services/session/chat/session-registry";
import type { LineageTaskRef } from "@shared/types/lineage";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

export interface SystemReminderContext {
  owner: SessionOwner;
  workspaceId: string;
  projectPath: string;
  cwd: string;
  fylloSessionId: string;
  agentId: string;
  changeId?: string;
  stageIndex?: number;
  runId?: string;
  worktreePath?: string;
  taskRef?: LineageTaskRef;
  taskTitle?: string;
  workspaceSnapshot?: SessionWorkspaceSnapshot;
}
