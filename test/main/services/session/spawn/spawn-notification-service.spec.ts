import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnedTurnRecord } from "@main/infra/storage/spawned-session-store";

const mocks = vi.hoisted(() => ({
  records: [] as SpawnedTurnRecord[],
  parents: new Set<string>(),
  claim: vi.fn(),
  patchTurn: vi.fn(),
  patchMeta: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@main/infra/storage/session-store", () => ({
  loadSessionMeta: vi.fn(async (_workspaceId: string, sessionId: string) =>
    mocks.parents.has(sessionId) ? { sessionId } : null
  ),
}));

vi.mock("@main/infra/storage/spawned-session-store", async () => {
  const actual = await vi.importActual<typeof import("@main/infra/storage/spawned-session-store")>(
    "@main/infra/storage/spawned-session-store"
  );
  return {
    ...actual,
    listPendingSpawnNotifications: vi.fn(async (workspaceId: string) =>
      mocks.records.filter(
        (record) => record.workspaceId === workspaceId && record.notification?.state === "pending"
      )
    ),
    listSpawnedTurnRecordsForWorkspace: vi.fn(async (workspaceId: string) =>
      mocks.records.filter((record) => record.workspaceId === workspaceId)
    ),
    claimSpawnNotification: mocks.claim,
    patchSpawnedTurnRecord: mocks.patchTurn,
    patchSpawnedSessionMeta: mocks.patchMeta,
    setSpawnNotificationState: mocks.setState,
  };
});

import { SpawnNotificationService } from "@main/services/session/spawn/spawn-notification-service";
import type { SpawnNotificationSummary } from "@shared/ipc/session/chat.schemas";

const appRestartedMessage =
  "FylloCode restarted while the spawned turn was still running. The turn was interrupted and cannot be resumed. If the task is still needed, call prompt_to_agent again without sessionId and restate the task.";

function record(overrides: Partial<SpawnedTurnRecord> = {}): SpawnedTurnRecord {
  return {
    version: 1,
    workspaceId: "workspace-1",
    parentSessionId: "parent-1",
    sessionId: "spawn-1",
    turnId: "turn-1",
    agentId: "agent-1",
    mode: "background",
    phase: "completed",
    startedAt: "2026-08-08T00:00:00.000Z",
    lastActivityAt: "2026-08-08T00:00:01.000Z",
    recentActivity: [],
    config: [],
    warnings: [],
    responseId: "response-1",
    notification: {
      notificationId: "notification-1",
      state: "pending",
      updatedAt: "2026-08-08T00:00:02.000Z",
    },
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:02.000Z",
    ...overrides,
  };
}

describe("SpawnNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.records.length = 0;
    mocks.parents.clear();
    mocks.parents.add("parent-1");
    mocks.claim.mockImplementation(async (workspaceId: string, notificationId: string) => {
      const candidate = mocks.records.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.notification?.notificationId === notificationId &&
          item.notification.state === "pending"
      );
      if (!candidate) return null;
      candidate.notification = {
        notificationId,
        state: "dispatched",
        updatedAt: new Date().toISOString(),
      };
      return structuredClone(candidate);
    });
    mocks.setState.mockImplementation(async (_owner, turnId, notificationId, state) => {
      const candidate = mocks.records.find((item) => item.turnId === turnId);
      if (candidate) {
        candidate.notification = {
          notificationId,
          state,
          updatedAt: new Date().toISOString(),
        };
      }
      return candidate ?? null;
    });
    mocks.patchTurn.mockImplementation(async (_owner, turnId, patch) => {
      const candidate = mocks.records.find((item) => item.turnId === turnId);
      if (!candidate) return null;
      Object.assign(candidate, typeof patch === "function" ? patch(candidate) : patch);
      return structuredClone(candidate);
    });
    mocks.patchMeta.mockResolvedValue({});
  });

  it("只列出目标 Workspace 中父 Session 仍存在的 pending terminal", async () => {
    mocks.records.push(
      record(),
      record({ workspaceId: "workspace-2", notification: { ...record().notification! } }),
      record({ turnId: "turn-2", parentSessionId: "missing-parent" })
    );
    const service = new SpawnNotificationService();

    const expected: SpawnNotificationSummary[] = [
      {
        notificationId: "notification-1",
        parentSessionId: "parent-1",
        spawnedSessionId: "spawn-1",
        turnId: "turn-1",
        status: "completed",
        responseId: "response-1",
      },
    ];
    await expect(service.list("workspace-1")).resolves.toEqual(expected);
    expect(mocks.setState).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", parentSessionId: "missing-parent" }),
      "turn-2",
      "notification-1",
      "suppressed",
      expect.any(String)
    );
  });

  it("claim 是不可逆边界，重复调用只有第一次取得 record", async () => {
    mocks.records.push(record());
    const service = new SpawnNotificationService();

    await expect(service.claim("workspace-1", "notification-1")).resolves.toMatchObject({
      notification: { state: "dispatched" },
    });
    await expect(service.claim("workspace-1", "notification-1")).resolves.toBeNull();
  });

  it("reminder 仅包含引用与权限边界，不包含正文或路径", () => {
    const service = new SpawnNotificationService();
    const reminder = service.buildReminder(record());

    expect(reminder).toContain("notificationId=notification-1");
    expect(reminder).toContain("sessionId=spawn-1");
    expect(reminder).toContain("responseId=response-1");
    expect(reminder).toContain("untrusted");
    expect(reminder).toContain("grants no new");
    expect(reminder).not.toContain("responsePath");
    expect(reminder).not.toContain("/Users/");
  });

  it("重启 reconciliation 中断遗留 turn，且 dispatched 只转 delivery_unknown", async () => {
    mocks.records.push(
      record({
        turnId: "running-turn",
        phase: "running",
        responseId: undefined,
        notification: undefined,
      }),
      record({
        turnId: "dispatched-turn",
        notification: {
          notificationId: "notification-2",
          state: "dispatched",
          updatedAt: "2026-08-08T00:00:03.000Z",
        },
      })
    );
    const wakes: string[] = [];
    const service = new SpawnNotificationService();
    service.setWakeHandler((workspaceId) => wakes.push(workspaceId));

    await service.reconcileWorkspace("workspace-1");

    expect(mocks.records.find((item) => item.turnId === "running-turn")).toMatchObject({
      phase: "interrupted",
      error: { code: "APP_RESTARTED", message: appRestartedMessage },
      notification: { state: "pending" },
    });
    expect(mocks.records.find((item) => item.turnId === "dispatched-turn")).toMatchObject({
      notification: { state: "delivery_unknown" },
    });
    expect(wakes).toEqual(["workspace-1"]);
  });

  it("shutdown 后拒绝新 claim", async () => {
    mocks.records.push(record());
    const service = new SpawnNotificationService();
    service.beginShutdown();
    await expect(service.claim("workspace-1", "notification-1")).resolves.toBeNull();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
