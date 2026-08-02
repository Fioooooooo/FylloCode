import { describe, expect, it } from "vitest";
import {
  buildIndexFromSubjects,
  deriveIndexEntries,
} from "@main/domain/insight/lineage/index-derive";
import type { LineageTaskSnapshot, Subject } from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const createdAt = new Date("2026-06-01T00:00:00.000Z");
  return {
    id: "task-1",
    workspaceId: "tmp-project",
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
          { folderId: "folder-a", changeId: "change-1", createdAt: "2026-06-09T00:02:00.000Z" },
          { folderId: "folder-a", changeId: "change-2", createdAt: "2026-06-09T00:03:00.000Z" },
        ],
        plans: [{ slug: "2026-06-29-plan-a", createdAt: "2026-06-09T00:03:30.000Z" }],
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
        "folder-a\0change-1": "subject-1",
        "folder-a\0change-2": "subject-1",
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
                  folderId: "folder-a",
                  changeId: "change-1",
                  commitHash: "abc123",
                  createdAt: "2026-06-09T00:02:00.000Z",
                },
              ],
              plans: [{ slug: "2026-06-29-plan-a", createdAt: "2026-06-09T00:03:00.000Z" }],
            },
          ],
        })
      )
    ).toEqual({
      tasks: { "local:task-1": "subject-1" },
      sessions: { "session-1": "subject-1" },
      proposals: { "folder-a\0change-1": "subject-1" },
      commitHashes: { "folder-a\0abc123": "subject-1" },
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
          proposals: [
            {
              folderId: "folder-b",
              changeId: "change-3",
              createdAt: "2026-06-09T00:06:00.000Z",
            },
          ],
          plans: [{ slug: "2026-06-29-plan-b", createdAt: "2026-06-09T00:06:30.000Z" }],
        },
      ],
      updatedAt: "2026-06-09T00:07:00.000Z",
    });

    expect(buildIndexFromSubjects([taskSubject, chatSubject])).toEqual({
      version: 2,
      tasks: { "local:task-1": "subject-1" },
      sessions: {
        "session-1": "subject-1",
        "session-2": "subject-2",
      },
      proposals: {
        "folder-a\0change-1": "subject-1",
        "folder-a\0change-2": "subject-1",
        "folder-b\0change-3": "subject-2",
      },
      commitHashes: {},
      updatedAt: "2026-06-09T00:07:00.000Z",
    });
  });

  it("does not derive plan entries into the index", () => {
    const index = buildIndexFromSubjects([subject()]);

    expect(index).not.toHaveProperty("plans");
    expect(JSON.stringify(index)).not.toContain("2026-06-29-plan-a");
  });

  it("keeps same-name proposals from different Folders", () => {
    const first = subject();
    const second = subject({
      id: "subject-2",
      task: null,
      links: [
        {
          sessionId: "session-2",
          createdAt: "2026-06-09T00:05:00.000Z",
          proposals: [
            {
              folderId: "folder-b",
              changeId: "change-1",
              createdAt: "2026-06-09T00:06:00.000Z",
            },
          ],
          plans: [],
        },
      ],
    });

    expect(buildIndexFromSubjects([first, second]).proposals).toMatchObject({
      "folder-a\0change-1": "subject-1",
      "folder-b\0change-1": "subject-2",
    });
  });
});
