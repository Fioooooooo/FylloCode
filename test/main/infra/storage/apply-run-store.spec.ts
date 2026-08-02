import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta, ArchiveRunMeta } from "@shared/types/proposal";

const { tempRoot, loggerWarn } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-apply-run-"),
    loggerWarn: vi.fn(),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/logger", () => ({
  default: {
    warn: loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  archiveMessagesPath,
  archiveRunMetaPath,
  applyRunDir,
  appendArchiveMessage,
  loadApplyRunMeta,
  loadArchiveMessages,
  loadArchiveRunMeta,
  saveApplyRunMeta,
  saveArchiveRunMeta,
  stageMessagesPath,
  updateApplyRunStageAcpSessionId,
  updateArchiveRunAcpSessionId,
} from "@main/infra/storage/apply-run-store";

function message(id: string, text: string): UIMessage<MessageMeta> {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function persisted(message: UIMessage<MessageMeta>): UIMessage<MessageMeta> {
  return JSON.parse(JSON.stringify(message)) as UIMessage<MessageMeta>;
}

function runMeta(overrides: Partial<ApplyRunMeta> = {}): ApplyRunMeta {
  return {
    runId: "run-1",
    changeId: "change-1",
    workflowId: "workflow-1",
    stages: [],
    currentStageIndex: 1,
    stageAcpSessionIds: { 0: "acp-0" },
    status: "running",
    startedAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  loggerWarn.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-18T11:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("apply-run-store archive storage", () => {
  it("keeps apply/archive runs under workspaces/<workspaceId>/apply-runs", () => {
    expect(applyRunDir("workspace-1", "change-1")).toBe(
      `${tempRoot}/workspaces/workspace-1/apply-runs/change-1`
    );
    expect(stageMessagesPath("workspace-1", "change-1", 2)).toBe(
      `${tempRoot}/workspaces/workspace-1/apply-runs/change-1/stage-2.messages.jsonl`
    );
    expect(archiveRunMetaPath("workspace-1", "change-1")).toBe(
      `${tempRoot}/workspaces/workspace-1/apply-runs/change-1/archive.json`
    );
    expect(archiveMessagesPath("workspace-1", "change-1")).toBe(
      `${tempRoot}/workspaces/workspace-1/apply-runs/change-1/archive.messages.jsonl`
    );
  });

  it("returns empty archive data when files do not exist", async () => {
    await expect(loadArchiveRunMeta("workspace-1", "change-1")).resolves.toBeNull();
    await expect(loadArchiveMessages("workspace-1", "change-1")).resolves.toEqual([]);
  });

  it("round-trips archive run meta", async () => {
    const meta: ArchiveRunMeta = {
      runId: "archive-1",
      changeId: "change-1",
      status: "running",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    };

    await saveArchiveRunMeta("workspace-1", meta);

    await expect(loadArchiveRunMeta("workspace-1", "change-1")).resolves.toEqual(meta);
  });

  it("appends archive messages in order", async () => {
    const first = message("message-1", "first");
    const second = message("message-2", "second");

    await appendArchiveMessage("workspace-1", "change-1", first);
    await appendArchiveMessage("workspace-1", "change-1", second);

    await expect(loadArchiveMessages("workspace-1", "change-1")).resolves.toEqual([
      persisted(first),
      persisted(second),
    ]);
  });

  it("updates only the target stage acpSessionId for the current run", async () => {
    await saveApplyRunMeta("workspace-1", runMeta());

    await updateApplyRunStageAcpSessionId("workspace-1", "change-1", "run-1", 1, "acp-1");

    await expect(loadApplyRunMeta("workspace-1", "change-1")).resolves.toEqual({
      runId: "run-1",
      changeId: "change-1",
      workflowId: "workflow-1",
      stages: [],
      currentStageIndex: 1,
      stageAcpSessionIds: { 0: "acp-0", 1: "acp-1" },
      status: "running",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-18T11:00:00.000Z",
    });
  });

  it("does nothing when updating a stage for a stale runId", async () => {
    await saveApplyRunMeta("workspace-1", runMeta({ runId: "run-2" }));

    await updateApplyRunStageAcpSessionId("workspace-1", "change-1", "run-1", 1, "acp-1");

    await expect(loadApplyRunMeta("workspace-1", "change-1")).resolves.toEqual(
      runMeta({ runId: "run-2" })
    );
  });

  it("updates archive acpSessionId without dropping archive fields", async () => {
    const meta: ArchiveRunMeta = {
      runId: "archive-1",
      changeId: "change-1",
      status: "done",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    };
    await saveArchiveRunMeta("workspace-1", meta);

    await updateArchiveRunAcpSessionId("workspace-1", "change-1", "acp-archive");

    await expect(loadArchiveRunMeta("workspace-1", "change-1")).resolves.toEqual({
      ...meta,
      acpSessionId: "acp-archive",
      updatedAt: "2026-05-18T11:00:00.000Z",
    });
  });

  it("warns and no-ops when archive meta is missing", async () => {
    await updateArchiveRunAcpSessionId("workspace-1", "change-1", "acp-archive");

    await expect(loadArchiveRunMeta("workspace-1", "change-1")).resolves.toBeNull();
    expect(loggerWarn).toHaveBeenCalledOnce();
  });

  it("loads saved apply run meta with worktreePath omitted as undefined", async () => {
    await saveApplyRunMeta("workspace-1", runMeta({ worktreePath: undefined }));

    const raw = readFileSync(`${applyRunDir("workspace-1", "change-1")}/run.json`, "utf8");
    expect(raw).not.toContain("worktreePath");

    const meta = await loadApplyRunMeta("workspace-1", "change-1");
    expect(meta?.worktreePath).toBeUndefined();
  });

  it("loads legacy apply run meta without a worktreePath field", async () => {
    const dir = applyRunDir("workspace-1", "change-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/run.json`,
      JSON.stringify({
        runId: "run-1",
        changeId: "change-1",
        workflowId: "workflow-1",
        stages: [],
        currentStageIndex: 1,
        stageAcpSessionIds: { 0: "acp-0" },
        status: "running",
        startedAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
      }),
      "utf8"
    );

    const meta = await loadApplyRunMeta("workspace-1", "change-1");
    expect(meta?.worktreePath).toBeUndefined();
  });

  it("round-trips an absolute worktreePath for apply run meta", async () => {
    await saveApplyRunMeta(
      "workspace-1",
      runMeta({ worktreePath: "workspace-1/.worktrees/change-1" })
    );

    await expect(loadApplyRunMeta("workspace-1", "change-1")).resolves.toEqual(
      runMeta({ worktreePath: "workspace-1/.worktrees/change-1" })
    );
  });
});
