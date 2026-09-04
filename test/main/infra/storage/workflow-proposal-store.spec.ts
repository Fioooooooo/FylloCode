import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ root: "" }));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (subPath: string) => join(paths.root, subPath),
}));

import {
  listWorkflowProposals,
  loadWorkflowProposal,
  saveWorkflowProposal,
  updateWorkflowProposalStatus,
} from "@main/infra/storage/workflow-proposal-store";
import {
  workflowProposalDefinitionPath,
  workflowProposalMetaPath,
} from "@main/infra/storage/workspace-paths";

const timestamp = "2026-09-02T00:00:00.000Z";

function proposalInput(workspaceId: string, parentSessionId: string, proposalId: string) {
  return {
    workspaceId,
    parentSessionId,
    proposalId,
    yaml: "name: Demo\nversion: 2\nstages: []\n",
    mode: "create" as const,
    suggestedPersist: "session" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-workflow-proposal-"));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

describe("workflow-proposal-store", () => {
  it("serializes concurrent metadata writes and leaves valid atomic files", async () => {
    await saveWorkflowProposal(proposalInput("workspace-a", "session-a", "proposal-1"));
    await Promise.all([
      updateWorkflowProposalStatus("workspace-a", "session-a", "proposal-1", "confirming"),
      updateWorkflowProposalStatus("workspace-a", "session-a", "proposal-1", "cancelled"),
    ]);

    const record = await loadWorkflowProposal("workspace-a", "session-a", "proposal-1");
    expect(record?.meta.status).toBe("cancelled");
    expect(record?.yaml).toContain("name: Demo");
    expect(
      JSON.parse(
        await readFile(workflowProposalMetaPath("workspace-a", "session-a", "proposal-1"), "utf8")
      )
    ).toMatchObject({
      proposalId: "proposal-1",
      status: "cancelled",
    });
    expect(
      await readFile(
        workflowProposalDefinitionPath("workspace-a", "session-a", "proposal-1"),
        "utf8"
      )
    ).toContain("version: 2");
  });

  it("isolates same proposal ids by workspace and parent session", async () => {
    await saveWorkflowProposal(proposalInput("workspace-a", "session-a", "same-id"));
    await saveWorkflowProposal({
      ...proposalInput("workspace-b", "session-b", "same-id"),
      yaml: "name: Other\nversion: 2\nstages: []\n",
    });

    await expect(
      loadWorkflowProposal("workspace-a", "session-a", "same-id")
    ).resolves.toMatchObject({
      yaml: expect.stringContaining("name: Demo"),
    });
    await expect(
      loadWorkflowProposal("workspace-b", "session-b", "same-id")
    ).resolves.toMatchObject({
      yaml: expect.stringContaining("name: Other"),
    });
    await expect(listWorkflowProposals("workspace-a", "session-b")).resolves.toEqual([]);
  });

  it("lists all terminal and pending proposal metadata without exposing YAML in the summary layer", async () => {
    await saveWorkflowProposal(proposalInput("workspace-a", "session-a", "one"));
    await saveWorkflowProposal({
      ...proposalInput("workspace-a", "session-a", "two"),
      status: "confirmed",
    });
    const records = await listWorkflowProposals("workspace-a", "session-a");
    expect(records.map((record) => record.meta.proposalId)).toEqual(["one", "two"]);
    expect(records[0]?.yaml).toBeDefined();
  });
});
