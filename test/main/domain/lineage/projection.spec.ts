import { describe, expect, it } from "vitest";
import {
  projectProposalOrigin,
  projectSessionLineage,
  projectTaskDownstream,
} from "@main/domain/lineage/projection";
import type { LineageTaskSnapshot, Subject } from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const createdAt = new Date("2026-06-01T00:00:00.000Z");
  return {
    id: "task-1",
    projectId: "tmp-project",
    title: "Lineage task",
    description: { format: "plain_text", content: "Details" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    assignee: undefined,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function taskSnapshot(overrides: Partial<LineageTaskSnapshot> = {}): LineageTaskSnapshot {
  return {
    ref: "local:task-1",
    snapshot: task(),
    capturedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

function subject(): Subject {
  return {
    id: "subject-1",
    origin: "task",
    task: taskSnapshot(),
    links: [
      {
        sessionId: "session-1",
        createdAt: "2026-06-09T00:01:00.000Z",
        proposals: [
          { changeId: "change-1", createdAt: "2026-06-09T00:02:00.000Z" },
          { changeId: "change-2", createdAt: "2026-06-09T00:03:00.000Z" },
        ],
      },
      {
        sessionId: "session-2",
        createdAt: "2026-06-09T00:04:00.000Z",
        proposals: [],
      },
    ],
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:05:00.000Z",
  };
}

describe("lineage projections", () => {
  it("projects task downstream sessions and proposals", () => {
    expect(projectTaskDownstream(subject())).toEqual({
      subjectId: "subject-1",
      origin: "task",
      task: taskSnapshot(),
      links: subject().links,
    });
  });

  it("projects one session lineage with upstream origin and outputs", () => {
    expect(projectSessionLineage(subject(), "session-1")).toEqual({
      subjectId: "subject-1",
      origin: "task",
      task: taskSnapshot(),
      session: subject().links[0],
    });
    expect(projectSessionLineage(subject(), "session-missing")).toBeNull();
  });

  it("projects proposal origin with original task and origin", () => {
    expect(projectProposalOrigin(subject(), "change-2")).toEqual({
      subjectId: "subject-1",
      origin: "task",
      task: taskSnapshot(),
      sessionId: "session-1",
      proposal: { changeId: "change-2", createdAt: "2026-06-09T00:03:00.000Z" },
    });
    expect(projectProposalOrigin(subject(), "change-missing")).toBeNull();
  });
});
