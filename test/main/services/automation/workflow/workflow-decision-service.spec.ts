import { describe, expect, it, vi } from "vitest";
import {
  WorkflowDecisionService,
  type WorkflowDecisionServiceDependencies,
} from "@main/services/automation/workflow/workflow-decision-service";
import type { WorkflowDecisionRecord } from "@main/infra/storage/workflow-decision-store";

const timestamp = "2026-09-02T00:00:00.000Z";

function record(
  proposalId: string,
  state: WorkflowDecisionRecord["notification"]["state"] = "pending",
  parentSessionId = "session-1"
): WorkflowDecisionRecord {
  return {
    version: 1,
    workspaceId: "workspace-1",
    parentSessionId,
    proposalId,
    decision: "cancelled",
    notification: {
      notificationId: `notification-${proposalId}`,
      state,
      updatedAt: timestamp,
    },
    decidedAt: timestamp,
    updatedAt: timestamp,
  };
}

function harness(initial: WorkflowDecisionRecord[]) {
  const records = new Map(initial.map((item) => [item.proposalId, item]));
  const liveSessions = new Set(initial.map((item) => item.parentSessionId));
  const setNotificationState = vi.fn(
    async (
      owner: { workspaceId: string; parentSessionId: string },
      proposalId: string,
      notificationId: string,
      state: Exclude<WorkflowDecisionRecord["notification"]["state"], "pending" | "dispatched">,
      updatedAt: string
    ) => {
      const current = records.get(proposalId);
      if (!current || current.notification.notificationId !== notificationId) return null;
      const next = {
        ...current,
        workspaceId: owner.workspaceId,
        parentSessionId: owner.parentSessionId,
        notification: { ...current.notification, state, updatedAt },
        updatedAt,
      };
      records.set(proposalId, next);
      return next;
    }
  );
  const claim = vi.fn(async (_workspaceId: string, notificationId: string) => {
    const current = [...records.values()].find(
      (item) =>
        item.notification.notificationId === notificationId && item.notification.state === "pending"
    );
    if (!current) return null;
    const next = {
      ...current,
      notification: { ...current.notification, state: "dispatched" as const, updatedAt: timestamp },
      updatedAt: timestamp,
    };
    records.set(current.proposalId, next);
    return next;
  });
  const dependencies: Partial<WorkflowDecisionServiceDependencies> = {
    listPending: vi.fn(async () =>
      [...records.values()].filter((item) => item.notification.state === "pending")
    ),
    listAll: vi.fn(async () => [...records.values()]),
    claim,
    setNotificationState,
    loadSession: vi.fn(async (_workspaceId: string, sessionId: string) =>
      liveSessions.has(sessionId) ? ({ sessionId } as never) : null
    ),
    now: () => timestamp,
  };
  return {
    service: new WorkflowDecisionService(dependencies),
    records,
    liveSessions,
    setNotificationState,
  };
}

describe("WorkflowDecisionService", () => {
  it("lists pending decisions, claims once, and builds an invisible cancellation reminder", async () => {
    const item = record("proposal-1");
    const h = harness([item]);
    await expect(h.service.list("workspace-1")).resolves.toEqual([
      expect.objectContaining({ proposalId: "proposal-1", state: "pending" }),
    ]);
    expect(h.service.buildReminder(item)).toContain("<system-reminder>");
    expect(h.service.buildReminder(item)).toContain("用户已取消");
    await expect(h.service.claim("workspace-1", "notification-proposal-1")).resolves.toMatchObject({
      notification: { state: "dispatched" },
    });
    await expect(h.service.claim("workspace-1", "notification-proposal-1")).resolves.toBeNull();
  });

  it("supports delivered and delivery_unknown terminal outcomes", async () => {
    const h = harness([record("proposal-1", "dispatched")]);
    const dispatched = h.records.get("proposal-1");
    if (!dispatched) throw new Error("fixture missing");
    await h.service.markDelivered(dispatched);
    expect(h.records.get("proposal-1")?.notification.state).toBe("delivered");

    const unknown = record("proposal-2", "dispatched");
    h.records.set(unknown.proposalId, unknown);
    await h.service.markDeliveryUnknown(unknown);
    expect(h.records.get("proposal-2")?.notification.state).toBe("delivery_unknown");
  });

  it("reconciles dispatched records after restart and suppresses pending records on parent delete", async () => {
    const h = harness([
      record("proposal-dispatched", "dispatched"),
      record("proposal-pending", "pending"),
      record("proposal-delivered", "delivered"),
    ]);
    await h.service.reconcileWorkspace("workspace-1");
    expect(h.records.get("proposal-dispatched")?.notification.state).toBe("delivery_unknown");
    await h.service.suppressParent("workspace-1", "session-1");
    expect(h.records.get("proposal-pending")?.notification.state).toBe("suppressed");
    expect(h.records.get("proposal-delivered")?.notification.state).toBe("delivered");
  });

  it("does not reconcile a dispatched decision while its app-owned Chat turn is live", async () => {
    const h = harness([record("proposal-dispatched", "dispatched")]);
    const isTurnLive = vi.fn(() => true);
    const service = new WorkflowDecisionService({
      listAll: vi.fn(async () => [...h.records.values()]),
      isTurnLive,
    });

    await service.reconcileWorkspace("workspace-1");

    expect(isTurnLive).toHaveBeenCalledWith("workspace-1", "session-1");
    expect(h.records.get("proposal-dispatched")?.notification.state).toBe("dispatched");
  });

  it("suppresses decisions whose parent session no longer exists", async () => {
    const h = harness([record("proposal-orphan")]);
    h.liveSessions.delete("session-1");
    await expect(h.service.list("workspace-1")).resolves.toEqual([]);
    expect(h.records.get("proposal-orphan")?.notification.state).toBe("suppressed");
    expect(h.setNotificationState).toHaveBeenCalledWith(
      expect.objectContaining({ parentSessionId: "session-1" }),
      "proposal-orphan",
      "notification-proposal-orphan",
      "suppressed",
      timestamp
    );
  });
});
