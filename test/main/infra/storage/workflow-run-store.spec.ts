import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition, WorkflowRunSnapshot } from "@shared/types/workflow";

const paths = vi.hoisted(() => ({ root: "" }));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (subPath: string) => join(paths.root, subPath),
}));

import {
  appendWorkflowActionLog,
  appendWorkflowRunTranscript,
  listWorkflowRunSnapshotEntries,
  listWorkflowRunSnapshots,
  loadWorkflowRunSnapshot,
  readWorkflowActionLog,
  readWorkflowRunTranscript,
  saveWorkflowRunSnapshot,
} from "@main/infra/storage/workflow-run-store";
import { workflowRunSnapshotPath, workflowsDir } from "@main/infra/storage/workspace-paths";

const owner = {
  workspaceId: "workspace-a",
  workflowId: "workflow-1",
  runId: "run-1",
  parentSessionId: "parent-1",
};

const definition: WorkflowDefinition = {
  name: "Fixture",
  version: 2,
  stages: [
    {
      id: "done",
      kind: "action",
      op: { type: "exec", command: "true" },
      terminal: true,
    },
  ],
};

function snapshot(overrides: Partial<WorkflowRunSnapshot> = {}): WorkflowRunSnapshot {
  const now = "2026-09-01T00:00:00.000Z";
  return {
    snapshotSchemaVersion: 1,
    runId: owner.runId,
    workflowId: owner.workflowId,
    parentSessionId: owner.parentSessionId,
    frozenDefinition: definition,
    status: "running",
    currentStageId: "done",
    visitCounts: {},
    artifacts: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-workflow-run-"));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

describe("workflow-run-store", () => {
  it("atomically round-trips a complete owner-bound snapshot", async () => {
    const value = snapshot({ artifacts: { answer: "done" } });
    await saveWorkflowRunSnapshot(owner, value);

    const raw = await readFile(
      workflowRunSnapshotPath(owner.workspaceId, owner.workflowId, owner.runId),
      "utf8"
    );
    expect(JSON.parse(raw)).toEqual(value);
    await expect(loadWorkflowRunSnapshot(owner)).resolves.toEqual(value);
    await expect(
      loadWorkflowRunSnapshot({ ...owner, parentSessionId: "other-parent" })
    ).rejects.toMatchObject({ code: "WORKFLOW_SNAPSHOT_OWNER_MISMATCH" });
    await expect(
      saveWorkflowRunSnapshot(owner, { ...value, runId: "other-run" })
    ).rejects.toMatchObject({ code: "WORKFLOW_SNAPSHOT_OWNER_MISMATCH" });
  });

  it("does not leave a partial snapshot when its atomic root cannot be created", async () => {
    const workflowPath = join(workflowsDir(owner.workspaceId), owner.workflowId);
    await mkdir(workflowPath, { recursive: true });
    await writeFile(join(workflowPath, "runs"), "not-a-directory", "utf8");

    await expect(saveWorkflowRunSnapshot(owner, snapshot())).rejects.toBeTruthy();
    await expect(
      readFile(workflowRunSnapshotPath(owner.workspaceId, owner.workflowId, owner.runId), "utf8")
    ).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("ignores legacy name-based YAML and apply-runs data during run listing", async () => {
    await mkdir(workflowsDir(owner.workspaceId), { recursive: true });
    await writeFile(
      join(workflowsDir(owner.workspaceId), "legacy-name.yaml"),
      "name: Legacy\n",
      "utf8"
    );
    await mkdir(join(paths.root, "workspaces", owner.workspaceId, "apply-runs", "old"), {
      recursive: true,
    });
    await writeFile(
      join(paths.root, "workspaces", owner.workspaceId, "apply-runs", "old", "run.json"),
      JSON.stringify(snapshot()),
      "utf8"
    );

    await expect(listWorkflowRunSnapshotEntries(owner.workspaceId)).resolves.toEqual([]);
    await expect(
      listWorkflowRunSnapshots(owner.workspaceId, owner.parentSessionId)
    ).resolves.toEqual([]);
  });

  it("serializes transcript and Action output appends under the Run owner", async () => {
    await Promise.all([
      appendWorkflowRunTranscript(owner, "session-1", { event: "start" }),
      appendWorkflowRunTranscript(owner, "session-1", { event: "end" }),
      appendWorkflowActionLog(owner, "stage-1", "stdout\n"),
      appendWorkflowActionLog(owner, "stage-1", "stderr\n"),
    ]);

    await expect(readWorkflowRunTranscript(owner, "session-1")).resolves.toContain(
      JSON.stringify({ event: "start" })
    );
    await expect(readWorkflowRunTranscript(owner, "session-1")).resolves.toContain(
      JSON.stringify({ event: "end" })
    );
    await expect(readWorkflowActionLog(owner, "stage-1")).resolves.toBe("stdout\nstderr\n");
  });
});
