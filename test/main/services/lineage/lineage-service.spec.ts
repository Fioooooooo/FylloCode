import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineageTaskRef, LineageTaskSnapshot } from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-lineage-service-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { readIndex, readSubject } from "@main/infra/storage/lineage-store";
import { createSessionMeta } from "@main/infra/storage/session-store";
import { lineageDir, subjectsDir } from "@main/infra/storage/project-paths";
import {
  backfillTask,
  createSessionTask,
  ensureChatSubject,
  ensureTaskSubject,
  getByProposal,
  getBySession,
  getByTask,
  linkSession,
  linkTaskSession,
  rebuildIndex,
  recordProposal,
  recordProposalCommitHash,
} from "@main/services/lineage/lineage-service";

const projectPath = "/tmp/project";

function setNow(iso: string): void {
  vi.setSystemTime(new Date(iso));
}

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

function taskSnapshot(ref: LineageTaskRef = "local:task-1"): LineageTaskSnapshot {
  return {
    ref,
    snapshot: task({ id: ref.split(":")[1] ?? "task-1" }),
    capturedAt: "2026-06-09T00:00:00.000Z",
  };
}

function indexFilePath(): string {
  return `${lineageDir(projectPath)}/index.json`;
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.useFakeTimers();
  setNow("2026-06-09T00:00:00.000Z");
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("lineage-service", () => {
  it("handles task-origin topology with multiple sessions and proposals", async () => {
    const snapshot = taskSnapshot();
    const subject = await ensureTaskSubject(projectPath, snapshot);
    const repeated = await ensureTaskSubject(projectPath, snapshot);

    expect(subject.id).toMatch(/^subject-[A-Za-z0-9_-]{10}$/);
    expect(repeated.id).toBe(subject.id);

    setNow("2026-06-09T00:01:00.000Z");
    await linkSession(projectPath, "session-1", subject.id);
    setNow("2026-06-09T00:02:00.000Z");
    await recordProposal(projectPath, "session-1", "change-1");
    setNow("2026-06-09T00:03:00.000Z");
    await recordProposal(projectPath, "session-1", "change-2");
    setNow("2026-06-09T00:04:00.000Z");
    await linkSession(projectPath, "session-2", subject.id);
    setNow("2026-06-09T00:05:00.000Z");
    await recordProposal(projectPath, "session-2", "change-3");

    await linkSession(projectPath, "session-1", subject.id);
    await recordProposal(projectPath, "session-1", "change-1");

    await expect(getByTask(projectPath, snapshot.ref)).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "task",
      links: [
        {
          sessionId: "session-1",
          proposals: [{ changeId: "change-1" }, { changeId: "change-2" }],
        },
        {
          sessionId: "session-2",
          proposals: [{ changeId: "change-3" }],
        },
      ],
    });
    await expect(getBySession(projectPath, "session-1")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "task",
      session: {
        sessionId: "session-1",
        proposals: [{ changeId: "change-1" }, { changeId: "change-2" }],
      },
    });
    await expect(getByProposal(projectPath, "change-3")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "task",
      task: snapshot,
      sessionId: "session-2",
      proposal: { changeId: "change-3" },
    });

    await expect(readIndex(projectPath)).resolves.toMatchObject({
      tasks: { [snapshot.ref]: subject.id },
      sessions: {
        "session-1": subject.id,
        "session-2": subject.id,
      },
      proposals: {
        "change-1": subject.id,
        "change-2": subject.id,
        "change-3": subject.id,
      },
    });
  });

  it("handles chat-origin topology with proposal split and task backfill", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    const repeated = await ensureChatSubject(projectPath, "session-chat");

    expect(repeated.id).toBe(subject.id);
    expect(subject).toMatchObject({
      origin: "chat",
      task: null,
      links: [{ sessionId: "session-chat", proposals: [] }],
    });

    setNow("2026-06-09T00:01:00.000Z");
    await recordProposal(projectPath, "session-chat", "change-chat-1");
    setNow("2026-06-09T00:02:00.000Z");
    await recordProposal(projectPath, "session-chat", "change-chat-2");
    const backfilled = await backfillTask(
      projectPath,
      subject.id,
      taskSnapshot("local:task-backfilled")
    );

    expect(backfilled).toMatchObject({
      id: subject.id,
      origin: "chat",
      task: { ref: "local:task-backfilled" },
    });
    await expect(getByTask(projectPath, "local:task-backfilled")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "chat",
      links: [
        {
          sessionId: "session-chat",
          proposals: [{ changeId: "change-chat-1" }, { changeId: "change-chat-2" }],
        },
      ],
    });
    await expect(getBySession(projectPath, "session-chat")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "chat",
      task: { ref: "local:task-backfilled" },
    });
    await expect(getByProposal(projectPath, "change-chat-2")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "chat",
      task: { ref: "local:task-backfilled" },
      sessionId: "session-chat",
    });
  });

  it("creates a local task and backfills an existing chat subject", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    await createSessionMeta(projectPath, {
      sessionId: "session-chat",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });

    const created = await createSessionTask(projectPath, {
      sessionId: "session-chat",
      title: "补齐错误处理",
      description: "整理异常分支",
    });

    expect(created).toMatchObject({
      title: "补齐错误处理",
      description: { format: "plain_text", content: "整理异常分支" },
      originSessionId: "session-chat",
    });
    await expect(getBySession(projectPath, "session-chat")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "chat",
      task: {
        ref: `local:${created.id}`,
        snapshot: expect.objectContaining({
          id: created.id,
          originSessionId: "session-chat",
        }),
      },
    });
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      tasks: { [`local:${created.id}`]: subject.id },
      sessions: { "session-chat": subject.id },
    });
  });

  it("throws when session task backfill fails", async () => {
    mkdirSync(dirname(lineageDir(projectPath)), { recursive: true });
    writeFileSync(lineageDir(projectPath), "not a directory", "utf8");

    await expect(
      createSessionTask(projectPath, {
        sessionId: "session-chat",
        title: "Backfill later",
      })
    ).rejects.toThrow(/failed to bind session task/);
  });

  it("creates a chat subject before backfilling when the session has no subject", async () => {
    await createSessionMeta(projectPath, {
      sessionId: "session-new",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });

    const created = await createSessionTask(projectPath, {
      sessionId: "session-new",
      title: "Open discussion task",
    });

    await expect(getBySession(projectPath, "session-new")).resolves.toMatchObject({
      origin: "chat",
      session: { sessionId: "session-new" },
      task: {
        ref: `local:${created.id}`,
      },
    });
    await expect(getByTask(projectPath, `local:${created.id}`)).resolves.toMatchObject({
      origin: "chat",
      links: [{ sessionId: "session-new" }],
    });
  });

  it("updates session originTaskRef after creating a session task", async () => {
    await createSessionMeta(projectPath, {
      sessionId: "session-chat",
      agentId: "claude-acp",
      title: "Session",
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });

    const created = await createSessionTask(projectPath, {
      sessionId: "session-chat",
      title: "补齐错误处理",
    });

    const { loadSessionMeta } = await import("@main/infra/storage/session-store");
    const meta = await loadSessionMeta(projectPath, "session-chat");
    expect(meta?.originTaskRef).toBe(`local:${created.id}`);
  });

  it("links sessions by task ref idempotently", async () => {
    const snapshot = taskSnapshot("github:42");
    const subject = await ensureTaskSubject(projectPath, snapshot);

    setNow("2026-06-09T00:01:00.000Z");
    const linked = await linkTaskSession(projectPath, snapshot.ref, "session-from-task");
    const repeated = await linkTaskSession(projectPath, snapshot.ref, "session-from-task");

    expect(linked).toMatchObject({
      id: subject.id,
      task: snapshot,
      links: [{ sessionId: "session-from-task" }],
    });
    expect(repeated?.id).toBe(subject.id);
    expect(repeated?.links.filter((link) => link.sessionId === "session-from-task")).toHaveLength(
      1
    );
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      tasks: { [snapshot.ref]: subject.id },
      sessions: { "session-from-task": subject.id },
    });

    await expect(
      linkTaskSession(projectPath, "local:missing", "session-missing")
    ).resolves.toBeNull();
  });

  it("records proposal commit hashes into the subject and index", async () => {
    const subject = await ensureTaskSubject(projectPath, taskSnapshot());
    await linkSession(projectPath, "session-1", subject.id);
    await recordProposal(projectPath, "session-1", "change-1");

    setNow("2026-06-09T00:10:00.000Z");
    await expect(
      recordProposalCommitHash(projectPath, "change-1", "abc123")
    ).resolves.toMatchObject({
      id: subject.id,
      updatedAt: "2026-06-09T00:10:00.000Z",
      links: [
        {
          sessionId: "session-1",
          proposals: [{ changeId: "change-1", commitHash: "abc123" }],
        },
      ],
    });

    await expect(readSubject(projectPath, subject.id)).resolves.toMatchObject({
      links: [
        {
          proposals: [{ changeId: "change-1", commitHash: "abc123" }],
        },
      ],
    });
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      proposals: { "change-1": subject.id },
      commitHashes: { abc123: subject.id },
    });
  });

  it("records the same proposal commit hash idempotently", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    await recordProposal(projectPath, "session-chat", "change-chat");

    setNow("2026-06-09T00:10:00.000Z");
    await recordProposalCommitHash(projectPath, "change-chat", "abc123");
    setNow("2026-06-09T00:20:00.000Z");
    const repeated = await recordProposalCommitHash(projectPath, "change-chat", "abc123");

    expect(repeated).toMatchObject({
      id: subject.id,
      updatedAt: "2026-06-09T00:10:00.000Z",
      links: [
        {
          proposals: [{ changeId: "change-chat", commitHash: "abc123" }],
        },
      ],
    });
    expect(
      repeated?.links.flatMap((link) =>
        link.proposals.filter((proposal) => proposal.changeId === "change-chat")
      )
    ).toHaveLength(1);
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      commitHashes: { abc123: subject.id },
    });
  });

  it("does not overwrite an existing different proposal commit hash", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    await recordProposal(projectPath, "session-chat", "change-chat");

    setNow("2026-06-09T00:10:00.000Z");
    await recordProposalCommitHash(projectPath, "change-chat", "oldhash");
    setNow("2026-06-09T00:20:00.000Z");
    const repeated = await recordProposalCommitHash(projectPath, "change-chat", "newhash");

    expect(repeated).toMatchObject({
      id: subject.id,
      updatedAt: "2026-06-09T00:10:00.000Z",
      links: [
        {
          proposals: [{ changeId: "change-chat", commitHash: "oldhash" }],
        },
      ],
    });
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      commitHashes: { oldhash: subject.id },
    });
    await expect(readIndex(projectPath)).resolves.not.toMatchObject({
      commitHashes: { newhash: subject.id },
    });
  });

  it("returns null when recording a commit hash for an unknown proposal", async () => {
    await expect(
      recordProposalCommitHash(projectPath, "missing-change", "abc123")
    ).resolves.toBeNull();

    expect(existsSync(lineageDir(projectPath))).toBe(false);
  });

  it("self-heals a missing index during queries", async () => {
    const snapshot = taskSnapshot();
    const subject = await ensureTaskSubject(projectPath, snapshot);
    await linkSession(projectPath, "session-1", subject.id);
    await recordProposal(projectPath, "session-1", "change-1");
    unlinkSync(indexFilePath());

    await expect(getByProposal(projectPath, "change-1")).resolves.toMatchObject({
      subjectId: subject.id,
      origin: "task",
    });
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      proposals: { "change-1": subject.id },
    });
  });

  it("reuses existing task subjects when the write path rebuilds a missing index", async () => {
    const snapshot = taskSnapshot();
    const subject = await ensureTaskSubject(projectPath, snapshot);
    unlinkSync(indexFilePath());
    setNow("2026-06-09T00:10:00.000Z");

    await expect(ensureTaskSubject(projectPath, snapshot)).resolves.toMatchObject({
      id: subject.id,
    });
    await expect(readIndex(projectPath)).resolves.toMatchObject({
      tasks: { [snapshot.ref]: subject.id },
    });
  });

  it("returns empty query results without creating lineage files for a fresh project", async () => {
    await expect(getByTask(projectPath, "local:missing")).resolves.toBeNull();
    await expect(getBySession(projectPath, "session-missing")).resolves.toBeNull();
    await expect(getByProposal(projectPath, "change-missing")).resolves.toBeNull();

    expect(existsSync(lineageDir(projectPath))).toBe(false);
  });

  it("rebuilds index from valid subjects while skipping corrupt subject files", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    await recordProposal(projectPath, "session-chat", "change-chat");
    mkdirSync(subjectsDir(projectPath), { recursive: true });
    writeFileSync(`${subjectsDir(projectPath)}/subject-bad.json`, "{not-json", "utf8");
    unlinkSync(indexFilePath());

    await expect(rebuildIndex(projectPath)).resolves.toMatchObject({
      sessions: { "session-chat": subject.id },
      proposals: { "change-chat": subject.id },
    });
  });

  it("rebuilds commit hash index entries from subjects", async () => {
    const subject = await ensureChatSubject(projectPath, "session-chat");
    await recordProposal(projectPath, "session-chat", "change-chat");
    await recordProposalCommitHash(projectPath, "change-chat", "abc123");
    unlinkSync(indexFilePath());

    await expect(rebuildIndex(projectPath)).resolves.toMatchObject({
      sessions: { "session-chat": subject.id },
      proposals: { "change-chat": subject.id },
      commitHashes: { abc123: subject.id },
    });
  });
});
