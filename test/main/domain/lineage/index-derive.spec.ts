import { describe, expect, it } from "vitest";
import { buildIndexFromSubjects, deriveIndexEntries } from "@main/domain/lineage/index-derive";
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

function subject(overrides: Partial<Subject> = {}): Subject {
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
    ],
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:04:00.000Z",
    ...overrides,
  };
}

describe("lineage index derivation", () => {
  it("derives task, session, and proposal entries for a subject", () => {
    expect(deriveIndexEntries(subject())).toEqual({
      tasks: { "local:task-1": "subject-1" },
      sessions: { "session-1": "subject-1" },
      proposals: {
        "change-1": "subject-1",
        "change-2": "subject-1",
      },
      commitHashes: {},
    });
  });

  it("derives proposal commit hash entries for a subject", () => {
    expect(
      deriveIndexEntries(
        subject({
          links: [
            {
              sessionId: "session-1",
              createdAt: "2026-06-09T00:01:00.000Z",
              proposals: [
                {
                  changeId: "change-1",
                  commitHash: "abc123",
                  createdAt: "2026-06-09T00:02:00.000Z",
                },
              ],
            },
          ],
        })
      )
    ).toEqual({
      tasks: { "local:task-1": "subject-1" },
      sessions: { "session-1": "subject-1" },
      proposals: { "change-1": "subject-1" },
      commitHashes: { abc123: "subject-1" },
    });
  });

  it("rebuilds an index from subjects and skips task entries for taskless subjects", () => {
    const taskSubject = subject();
    const chatSubject = subject({
      id: "subject-2",
      origin: "chat",
      task: null,
      links: [
        {
          sessionId: "session-2",
          createdAt: "2026-06-09T00:05:00.000Z",
          proposals: [{ changeId: "change-3", createdAt: "2026-06-09T00:06:00.000Z" }],
        },
      ],
      updatedAt: "2026-06-09T00:07:00.000Z",
    });

    expect(buildIndexFromSubjects([taskSubject, chatSubject])).toEqual({
      version: 1,
      tasks: { "local:task-1": "subject-1" },
      sessions: {
        "session-1": "subject-1",
        "session-2": "subject-2",
      },
      proposals: {
        "change-1": "subject-1",
        "change-2": "subject-1",
        "change-3": "subject-2",
      },
      commitHashes: {},
      updatedAt: "2026-06-09T00:07:00.000Z",
    });
  });
});
