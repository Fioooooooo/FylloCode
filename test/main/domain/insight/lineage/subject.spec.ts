import { describe, expect, it } from "vitest";
import {
  appendPlan,
  appendProposal,
  attachTask,
  buildSubject,
  upsertSessionLink,
} from "@main/domain/insight/lineage/subject";
import type { LineageTaskSnapshot } from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

const now = "2026-06-09T00:00:00.000Z";
const later = "2026-06-09T00:01:00.000Z";

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
    capturedAt: later,
    ...overrides,
  };
}

describe("lineage subject domain", () => {
  it("builds task and chat subjects with immutable origin", () => {
    expect(buildSubject("task", taskSnapshot(), now, "subject-task")).toMatchObject({
      id: "subject-task",
      origin: "task",
      task: taskSnapshot(),
      links: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(buildSubject("chat", null, now, "subject-chat")).toMatchObject({
      id: "subject-chat",
      origin: "chat",
      task: null,
      links: [],
    });
  });

  it("upserts session links idempotently", () => {
    const subject = buildSubject("task", taskSnapshot(), now, "subject-1");
    const withFirst = upsertSessionLink(subject, "session-1", later);
    const duplicate = upsertSessionLink(withFirst, "session-1", "2026-06-09T00:02:00.000Z");
    const withSecond = upsertSessionLink(withFirst, "session-2", "2026-06-09T00:03:00.000Z");

    expect(withFirst.links).toEqual([
      { sessionId: "session-1", createdAt: later, proposals: [], plans: [] },
    ]);
    expect(duplicate).toBe(withFirst);
    expect(withSecond.links.map((link) => link.sessionId)).toEqual(["session-1", "session-2"]);
  });

  it("appends multiple proposals per session and keeps duplicates idempotent", () => {
    const subject = upsertSessionLink(
      upsertSessionLink(buildSubject("task", taskSnapshot(), now, "subject-1"), "session-1", now),
      "session-2",
      now
    );
    const withFirst = appendProposal(subject, "session-1", "change-1", later);
    const duplicate = appendProposal(withFirst, "session-1", "change-1", later);
    const withSecond = appendProposal(withFirst, "session-1", "change-2", later);
    const missingSession = appendProposal(withSecond, "session-missing", "change-3", later);

    expect(duplicate).toBe(withFirst);
    expect(missingSession).toBe(withSecond);
    expect(withSecond.links).toEqual([
      {
        sessionId: "session-1",
        createdAt: now,
        proposals: [
          { changeId: "change-1", createdAt: later },
          { changeId: "change-2", createdAt: later },
        ],
        plans: [],
      },
      { sessionId: "session-2", createdAt: now, proposals: [], plans: [] },
    ]);
  });

  it("appends multiple plans per session and keeps duplicates idempotent", () => {
    const subject = upsertSessionLink(
      upsertSessionLink(buildSubject("task", taskSnapshot(), now, "subject-1"), "session-1", now),
      "session-2",
      now
    );
    const withFirst = appendPlan(subject, "session-1", "2026-06-29-plan-a", later);
    const duplicate = appendPlan(withFirst, "session-1", "2026-06-29-plan-a", later);
    const withSecond = appendPlan(withFirst, "session-1", "2026-06-29-plan-b", later);
    const missingSession = appendPlan(withSecond, "session-missing", "2026-06-29-plan-c", later);

    expect(duplicate).toBe(withFirst);
    expect(missingSession).toBe(withSecond);
    expect(withSecond.links).toEqual([
      {
        sessionId: "session-1",
        createdAt: now,
        proposals: [],
        plans: [
          { slug: "2026-06-29-plan-a", createdAt: later },
          { slug: "2026-06-29-plan-b", createdAt: later },
        ],
      },
      { sessionId: "session-2", createdAt: now, proposals: [], plans: [] },
    ]);
  });

  it("attaches task snapshots without flipping chat origin", () => {
    const subject = buildSubject("chat", null, now, "subject-1");
    const withTask = attachTask(subject, taskSnapshot());
    const duplicate = attachTask(withTask, taskSnapshot());

    expect(withTask).toMatchObject({
      id: "subject-1",
      origin: "chat",
      task: taskSnapshot(),
      updatedAt: later,
    });
    expect(duplicate).toBe(withTask);
  });
});
