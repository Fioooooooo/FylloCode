import { rmSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyRunMeta } from "@shared/types/proposal";

const { tempRoot, loggerWarn } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-apply-stage-acp-session-store-"),
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

import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { loadApplyRunMeta, saveApplyRunMeta } from "@main/infra/storage/apply-run-store";

const projectPath = "/tmp/project";

function runMeta(overrides: Partial<ApplyRunMeta> = {}): ApplyRunMeta {
  return {
    runId: "run-1",
    changeId: "change-1",
    workflowId: "workflow-1",
    stages: [],
    currentStageIndex: 1,
    stageAcpSessionIds: {},
    status: "running",
    startedAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  loggerWarn.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-18T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("apply-stage-acp-session-store", () => {
  it("returns null when run meta is missing", async () => {
    const store = new ApplyStageAcpSessionStore(projectPath, "change-1", "run-1", 0);

    await expect(store.loadAcpSessionId()).resolves.toBeNull();
    expect(loggerWarn).toHaveBeenCalledOnce();
  });

  it("returns null when runId does not match", async () => {
    await saveApplyRunMeta(projectPath, runMeta({ runId: "run-2" }));

    const store = new ApplyStageAcpSessionStore(projectPath, "change-1", "run-1", 0);

    await expect(store.loadAcpSessionId()).resolves.toBeNull();
    expect(loggerWarn).toHaveBeenCalledOnce();
  });

  it("loads stage acpSessionId from run meta", async () => {
    await saveApplyRunMeta(projectPath, runMeta({ stageAcpSessionIds: { 1: "acp-existing" } }));

    const store = new ApplyStageAcpSessionStore(projectPath, "change-1", "run-1", 1);

    await expect(store.loadAcpSessionId()).resolves.toBe("acp-existing");
  });

  it("persists stage acpSessionId without dropping other fields", async () => {
    await saveApplyRunMeta(
      projectPath,
      runMeta({
        stageAcpSessionIds: { 0: "acp-0" },
        status: "done",
      })
    );

    const store = new ApplyStageAcpSessionStore(projectPath, "change-1", "run-1", 1);

    await store.persistAcpSessionId("acp-1");

    await expect(loadApplyRunMeta(projectPath, "change-1")).resolves.toEqual({
      runId: "run-1",
      changeId: "change-1",
      workflowId: "workflow-1",
      stages: [],
      currentStageIndex: 1,
      stageAcpSessionIds: { 0: "acp-0", 1: "acp-1" },
      status: "done",
      startedAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-18T09:00:00.000Z",
    });
  });
});
