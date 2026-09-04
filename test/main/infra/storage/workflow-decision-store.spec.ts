import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ root: "" }));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (subPath: string) => join(paths.root, subPath),
}));

import {
  claimWorkflowDecision,
  listPendingWorkflowDecisions,
  loadWorkflowDecision,
  saveWorkflowDecision,
  setWorkflowDecisionNotificationState,
} from "@main/infra/storage/workflow-decision-store";
import { workflowDecisionPath } from "@main/infra/storage/workspace-paths";

const timestamp = "2026-09-02T00:00:00.000Z";

function decision(workspaceId: string, parentSessionId: string, proposalId: string) {
  return {
    version: 1 as const,
    workspaceId,
    parentSessionId,
    proposalId,
    decision: "cancelled" as const,
    notification: {
      notificationId: `notification-${proposalId}`,
      state: "pending" as const,
      updatedAt: timestamp,
    },
    decidedAt: timestamp,
    updatedAt: timestamp,
  };
}

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-workflow-decision-"));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

describe("workflow-decision-store", () => {
  it("claims once and serializes concurrent terminal state writes", async () => {
    await saveWorkflowDecision(decision("workspace-a", "session-a", "proposal-1"));
    const [first, second] = await Promise.all([
      claimWorkflowDecision("workspace-a", "notification-proposal-1", "2026-09-02T00:01:00.000Z"),
      claimWorkflowDecision("workspace-a", "notification-proposal-1", "2026-09-02T00:02:00.000Z"),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const claimed = first ?? second;
    expect(claimed?.notification.state).toBe("dispatched");

    await Promise.all([
      setWorkflowDecisionNotificationState(
        { workspaceId: "workspace-a", parentSessionId: "session-a" },
        "proposal-1",
        "notification-proposal-1",
        "delivered",
        "2026-09-02T00:03:00.000Z"
      ),
      setWorkflowDecisionNotificationState(
        { workspaceId: "workspace-a", parentSessionId: "session-a" },
        "proposal-1",
        "notification-proposal-1",
        "delivery_unknown",
        "2026-09-02T00:04:00.000Z"
      ),
    ]);
    const stored = await loadWorkflowDecision("workspace-a", "session-a", "proposal-1");
    expect(stored?.notification.state).toBe("delivered");
    expect(
      JSON.parse(
        await readFile(workflowDecisionPath("workspace-a", "session-a", "proposal-1"), "utf8")
      )
    ).toMatchObject({
      proposalId: "proposal-1",
      notification: { state: "delivered" },
    });
  });

  it("keeps pending records isolated by workspace and parent", async () => {
    await saveWorkflowDecision(decision("workspace-a", "session-a", "same"));
    await saveWorkflowDecision(decision("workspace-b", "session-b", "same"));
    expect(await listPendingWorkflowDecisions("workspace-a")).toHaveLength(1);
    expect(await listPendingWorkflowDecisions("workspace-a")).toEqual([
      expect.objectContaining({ workspaceId: "workspace-a", parentSessionId: "session-a" }),
    ]);
    await expect(loadWorkflowDecision("workspace-a", "session-b", "same")).resolves.toBeNull();
  });
});
