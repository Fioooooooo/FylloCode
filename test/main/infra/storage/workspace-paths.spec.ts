import { describe, expect, it, vi } from "vitest";

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `/tmp/fyllocode-test/${subPath}`),
}));

import {
  folderDataDir,
  knowledgeDir,
  lineageDir,
  lineageSubjectsDir,
  mcpEventsDir,
  sessionPlansDir,
  spawnedSessionDir,
  spawnedSessionMessagesPath,
  spawnedSessionMetaPath,
  spawnedSessionResponsePath,
  spawnedSessionsDir,
  sessionsDir,
  tasksPath,
  workspaceDataDir,
  workflowsDir,
  workflowDir,
  workflowDefinitionPath,
  workflowRunsDir,
  workflowRunDir,
  workflowRunSnapshotPath,
  workflowRunSessionTranscriptPath,
  workflowRunActionOutputPath,
} from "@main/infra/storage/workspace-paths";

describe("Workspace storage path helpers", () => {
  it("uses stable Workspace identity without encoding a repository path", () => {
    expect(workspaceDataDir("workspace-stable-id")).toBe(
      "/tmp/fyllocode-test/workspaces/workspace-stable-id"
    );
    expect(workspaceDataDir("workspace.id with spaces")).toBe(
      "/tmp/fyllocode-test/workspaces/workspace.id with spaces"
    );
  });

  it("keeps Folder reverse data in an independent namespace", () => {
    expect(folderDataDir("folder-1")).toBe("/tmp/fyllocode-test/workspace-folders/folder-1");
  });

  it("resolves every Workspace-owned directory below the Workspace root", () => {
    const root = "/tmp/fyllocode-test/workspaces/workspace-1";
    expect(sessionsDir("workspace-1")).toBe(`${root}/sessions`);
    expect(sessionPlansDir("workspace-1", "session-1")).toBe(`${root}/sessions/session-1/plans`);
    expect(spawnedSessionsDir("workspace-1", "session-1")).toBe(`${root}/sessions/session-1/spawn`);
    expect(spawnedSessionDir("workspace-1", "session-1", "spawn-1")).toBe(
      `${root}/sessions/session-1/spawn/spawn-1`
    );
    expect(spawnedSessionMetaPath("workspace-1", "session-1", "spawn-1")).toBe(
      `${root}/sessions/session-1/spawn/spawn-1/meta.json`
    );
    expect(spawnedSessionMessagesPath("workspace-1", "session-1", "spawn-1")).toBe(
      `${root}/sessions/session-1/spawn/spawn-1/messages.jsonl`
    );
    expect(spawnedSessionResponsePath("workspace-1", "session-1", "spawn-1", "response-1")).toBe(
      `${root}/sessions/session-1/spawn/spawn-1/responses/response-1.md`
    );
    expect(tasksPath("workspace-1")).toBe(`${root}/tasks/tasks.json`);
    expect(knowledgeDir("workspace-1")).toBe(`${root}/knowledge`);
    expect(lineageDir("workspace-1")).toBe(`${root}/lineage`);
    expect(lineageSubjectsDir("workspace-1")).toBe(`${root}/lineage/subjects`);
    expect(mcpEventsDir("workspace-1")).toBe(`${root}/mcp-events`);
    expect(workflowsDir("workspace-1")).toBe(`${root}/workflows`);
    expect(workflowDir("workspace-1", "workflow-1")).toBe(`${root}/workflows/workflow-1`);
    expect(workflowDefinitionPath("workspace-1", "workflow-1")).toBe(
      `${root}/workflows/workflow-1/definition.yaml`
    );
    expect(workflowRunsDir("workspace-1", "workflow-1")).toBe(`${root}/workflows/workflow-1/runs`);
    expect(workflowRunDir("workspace-1", "workflow-1", "run-1")).toBe(
      `${root}/workflows/workflow-1/runs/run-1`
    );
    expect(workflowRunSnapshotPath("workspace-1", "workflow-1", "run-1")).toBe(
      `${root}/workflows/workflow-1/runs/run-1/run-1.json`
    );
    expect(
      workflowRunSessionTranscriptPath("workspace-1", "workflow-1", "run-1", "session-1")
    ).toBe(`${root}/workflows/workflow-1/runs/run-1/sessions/session-1.jsonl`);
    expect(workflowRunActionOutputPath("workspace-1", "workflow-1", "run-1", "stage-1")).toBe(
      `${root}/workflows/workflow-1/runs/run-1/action-outputs/stage-1.log`
    );
  });

  it("rejects identities that can escape the storage root", () => {
    expect(() => workspaceDataDir("../outside")).toThrow("Workspace ID is not safe");
    expect(() => folderDataDir("folder/child")).toThrow("Folder ID is not safe");
    expect(() => spawnedSessionDir("workspace-1", "../parent", "spawn-1")).toThrow(
      "Session ID is not safe"
    );
    expect(() =>
      spawnedSessionResponsePath("workspace-1", "parent-1", "spawn-1", "../secret")
    ).toThrow("Response ID is not safe");
    expect(() => workflowDir("workspace-1", "workflow/child")).toThrow("Workflow ID is not safe");
    expect(() => workflowRunSnapshotPath("workspace-1", "workflow-1", "../run")).toThrow(
      "Run ID is not safe"
    );
    expect(() =>
      workflowRunSessionTranscriptPath("workspace-1", "workflow-1", "run-1", "../session")
    ).toThrow("Session ID is not safe");
    expect(() =>
      workflowRunActionOutputPath("workspace-1", "workflow-1", "run-1", "stage/child")
    ).toThrow("Stage ID is not safe");
  });
});
