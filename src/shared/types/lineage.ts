import type { TaskItem, TaskSource } from "@shared/types/task";
import type { ProposalStatus } from "@shared/types/proposal";

export type LineageOrigin = "task" | "chat";

export type LineageTaskRef = `${TaskSource}:${string}`;

export type LineageTaskSnapshot = {
  ref: LineageTaskRef;
  snapshot: TaskItem;
  capturedAt: string;
};

export type LineageProposalLink = {
  changeId: string;
  createdAt: string;
  commitHash?: string;
};

export type LineagePlanLink = {
  slug: string;
  createdAt: string;
};

export type LineageSessionLink = {
  sessionId: string;
  createdAt: string;
  proposals: LineageProposalLink[];
  plans: LineagePlanLink[];
};

export type Subject = {
  id: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  links: LineageSessionLink[];
  createdAt: string;
  updatedAt: string;
};

export type TaskDownstreamProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  links: LineageSessionLink[];
};

export type SessionLineageProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  session: LineageSessionLink;
};

export type ProposalOriginProjection = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  sessionId: string;
  proposal: LineageProposalLink;
};

export interface CreateSessionTaskInput {
  sessionId: string;
  title: string;
  description?: string;
  /** Idempotency key for fyllo-action task creation. */
  actionId?: string;
}

export type PlanDocumentStatus = "draft" | "approved";

export type PlanDocument = {
  slug: string;
  goal: string;
  createdAt: string;
  status: PlanDocumentStatus;
  body: string;
};

export type LineageIndex = {
  version: 1;
  tasks: Record<string, string>;
  sessions: Record<string, string>;
  proposals: Record<string, string>;
  commitHashes: Record<string, string>;
  updatedAt: string;
};

export type LineageBrowserStatus = "applying" | "planned" | "completed" | "discussion";

export type LineageBrowserPlan = {
  slug: string;
  createdAt: string;
  goal: string | null;
  status: PlanDocumentStatus | null;
};

export type LineageBrowserProposal = {
  changeId: string;
  createdAt: string;
  commitHash: string | null;
  title: string | null;
  status: ProposalStatus | null;
};

export type LineageBrowserSession = {
  sessionId: string;
  title: string;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  plans: LineageBrowserPlan[];
  proposals: LineageBrowserProposal[];
};

export type LineageBrowserEntry = {
  subjectId: string;
  origin: LineageOrigin;
  task: LineageTaskSnapshot | null;
  status: LineageBrowserStatus;
  createdAt: string;
  updatedAt: string;
  sessions: LineageBrowserSession[];
};

export type LineageBrowserData = {
  entries: LineageBrowserEntry[];
};
