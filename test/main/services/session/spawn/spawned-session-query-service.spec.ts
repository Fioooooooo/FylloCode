import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getAgentById: vi.fn(),
  reconcileWorkspace: vi.fn(),
  isTurnLive: vi.fn(),
  getInspectionSnapshot: vi.fn(),
}));

vi.mock("@main/infra/storage/spawned-session-store", () => ({
  listSpawnedSessionsForParent: mocks.list,
}));
vi.mock("@main/infra/acp/agent-catalog", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("@main/services/session/spawn/spawn-notification-service", () => ({
  spawnNotificationService: { reconcileWorkspace: mocks.reconcileWorkspace },
}));
vi.mock("@main/services/session/spawn/spawned-session-manager", () => ({
  spawnedSessionManager: {
    isTurnLive: mocks.isTurnLive,
    getInspectionSnapshot: mocks.getInspectionSnapshot,
  },
}));

import { SpawnedSessionQueryService } from "@main/services/session/spawn/spawned-session-query-service";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1" };
const now = "2026-08-08T00:00:00.000Z";

function view(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      version: 1,
      ...owner,
      sessionId: "spawn-1",
      agentId: "agent-1",
      workspaceSnapshot: {
        workspaceId: "workspace-1",
        workspaceKind: "folder",
        primaryFolderId: "folder-1",
        folders: [],
        cwd: "/work",
        additionalDirectories: [],
      },
      status: "running",
      configOptions: [],
      turnCount: 0,
      tokenUsage: { used: 0, size: 0 },
      createdAt: now,
      updatedAt: now,
    },
    turns: [
      {
        version: 1,
        ...owner,
        sessionId: "spawn-1",
        turnId: "turn-1",
        agentId: "agent-1",
        mode: "background",
        phase: "running",
        startedAt: now,
        lastActivityAt: now,
        recentActivity: [],
        config: [],
        warnings: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Inspect code" }],
        metadata: { sessionId: "spawn-1", createdAt: new Date(now) },
      },
    ],
    ...overrides,
  };
}

describe("SpawnedSessionQueryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcileWorkspace.mockResolvedValue(undefined);
    mocks.getAgentById.mockResolvedValue({ id: "agent-1", name: "Agent One" });
    mocks.getInspectionSnapshot.mockReturnValue(null);
    mocks.list.mockResolvedValue([view()]);
  });

  it("projects a matching live snapshot without starting an Agent process", async () => {
    mocks.getInspectionSnapshot.mockReturnValue({
      turnId: "turn-1",
      mode: "background",
      startedAt: now,
      lastActivityAt: "2026-08-08T00:00:01.000Z",
      recentActivity: [{ kind: "text_delta", at: "2026-08-08T00:00:01.000Z" }],
      liveAssistantMessage: {
        id: "assistant-live",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Checking" },
          { type: "text", text: "Working" },
        ],
        metadata: { sessionId: "spawn-1", createdAt: new Date(now) },
      },
    });
    const service = new SpawnedSessionQueryService();
    const detail = await service.getSpawnedSessionDetail({ ...owner, sessionId: "spawn-1" });
    expect(detail).toMatchObject({
      status: "ready",
      summary: { status: "running", agent: { name: "Agent One" } },
      initialPrompt: { text: "Inspect code" },
      messages: [
        { role: "user", durable: true },
        { role: "assistant", durable: false },
      ],
    });
    expect(mocks.reconcileWorkspace).toHaveBeenCalledTimes(1);
  });

  it("prefers a durable terminal turn over stale running meta and keeps responseId opaque", async () => {
    mocks.getAgentById.mockResolvedValue(undefined);
    const completed = view();
    completed.turns[0].phase = "completed";
    Object.assign(completed.turns[0], { responseId: "response-1" });
    completed.messages.push({
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Done" }],
      metadata: { sessionId: "spawn-1", createdAt: new Date(now) },
    });
    mocks.list.mockResolvedValue([completed]);

    const result = await new SpawnedSessionQueryService().getSpawnedSessionDetail({
      ...owner,
      sessionId: "spawn-1",
    });
    expect(result).toMatchObject({
      status: "ready",
      summary: { status: "idle", agent: { name: "agent-1" }, latestResponseId: "response-1" },
      turns: [{ status: "idle", responseId: "response-1" }],
    });
    expect(JSON.stringify(result)).not.toContain("responsePath");
  });

  it("returns not_found for a Session outside the enumerated parent scope", async () => {
    mocks.list.mockResolvedValue([]);
    await expect(
      new SpawnedSessionQueryService().getSpawnedSessionDetail({
        ...owner,
        sessionId: "other-parent-session",
      })
    ).resolves.toEqual({ status: "not_found" });
  });
});
