import type { TaskItem, TaskSource } from "@shared/types/task";

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
};

export type LineageSessionLink = {
  sessionId: string;
  createdAt: string;
  proposals: LineageProposalLink[];
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

export interface CreateSessionTaskInput {
  sessionId: string;
  title: string;
  description?: string;
}

export type LineageIndex = {
  version: 1;
  tasks: Record<string, string>;
  sessions: Record<string, string>;
  proposals: Record<string, string>;
  updatedAt: string;
};
