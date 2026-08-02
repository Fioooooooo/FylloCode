import { mkdirSync, rmSync, writeFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyRunMeta, ArchiveRunMeta, ProposalRef } from "@shared/types/proposal";

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
  default: { warn: loggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  applyRunDir,
  loadApplyRunMeta,
  loadArchiveRunMeta,
  saveApplyRunMeta,
  saveArchiveRunMeta,
  updateApplyRunStageAcpSessionId,
  updateArchiveRunAcpSessionId,
} from "@main/infra/storage/apply-run-store";

const proposalRef: ProposalRef = { folderId: "folder-b", changeId: "change-1" };

function runMeta(overrides: Partial<ApplyRunMeta> = {}): ApplyRunMeta {
  return {
    runId: "run-1",
    proposalRef,
    worktreePath: "/repo-b/.worktrees/change-1",
    workflowId: "workflow-1",
    stages: [],
    currentStageIndex: 0,
    stageAcpSessionIds: {},
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

describe("apply-run-store", () => {
  it("uses ProposalRef to isolate same-named runs", async () => {
    const otherRef = { folderId: "folder-c", changeId: "change-1" };
    expect(applyRunDir("workspace-1", proposalRef)).toBe(
      `${tempRoot}/workspaces/workspace-1/apply-runs/folder-b/change-1`
    );

    await saveApplyRunMeta("workspace-1", runMeta());
    await saveApplyRunMeta(
      "workspace-1",
      runMeta({ proposalRef: otherRef, runId: "run-c", worktreePath: "/repo-c" })
    );

    await expect(loadApplyRunMeta("workspace-1", proposalRef)).resolves.toMatchObject({
      runId: "run-1",
      proposalRef,
    });
    await expect(loadApplyRunMeta("workspace-1", otherRef)).resolves.toMatchObject({
      runId: "run-c",
      proposalRef: otherRef,
    });
  });

  it("reads an ownerless legacy run without upgrading or mutating it", async () => {
    const legacyDir = `${tempRoot}/workspaces/workspace-1/apply-runs/change-1`;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      `${legacyDir}/run.json`,
      JSON.stringify({ ...runMeta(), proposalRef: undefined, worktreePath: undefined }),
      "utf8"
    );

    const legacy = await loadApplyRunMeta("workspace-1", proposalRef);
    expect(legacy?.proposalRef).toBeUndefined();
    await updateApplyRunStageAcpSessionId("workspace-1", proposalRef, "run-1", 0, "acp-1");
    expect((await loadApplyRunMeta("workspace-1", proposalRef))?.stageAcpSessionIds).toEqual({});
  });

  it("persists archive metadata and ACP session under the same owner key", async () => {
    const archive: ArchiveRunMeta = {
      runId: "archive-1",
      proposalRef,
      worktreePath: "/repo-b/.worktrees/change-1",
      status: "running",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    };
    await saveArchiveRunMeta("workspace-1", archive);
    await updateArchiveRunAcpSessionId("workspace-1", proposalRef, "acp-archive");
    await expect(loadArchiveRunMeta("workspace-1", proposalRef)).resolves.toEqual({
      ...archive,
      acpSessionId: "acp-archive",
      updatedAt: "2026-05-18T11:00:00.000Z",
    });
  });
});
