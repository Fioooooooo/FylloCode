import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSummaries: vi.fn(),
  loadDetail: vi.fn(),
  getAgentById: vi.fn(),
  reconcileWorkspace: vi.fn(),
  isTurnLive: vi.fn(),
  getInspectionSnapshot: vi.fn(),
}));

vi.mock("@main/infra/storage/spawned-session-store", () => ({
  listSpawnedSessionSummariesForParent: mocks.listSummaries,
  loadSpawnedSessionStoredView: mocks.loadDetail,
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
    const current = view();
    mocks.listSummaries.mockResolvedValue([{ meta: current.meta, latestTurn: current.turns[0] }]);
    mocks.loadDetail.mockResolvedValue(current);
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
      turns: [
        {
          prompt: { text: "Inspect code" },
          messages: [{ role: "assistant", durable: false }],
        },
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
    mocks.loadDetail.mockResolvedValue(completed);

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
    mocks.loadDetail.mockResolvedValue(null);
    await expect(
      new SpawnedSessionQueryService().getSpawnedSessionDetail({
        ...owner,
        sessionId: "other-parent-session",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("keeps multiple Turns isolated and derives a legacy detail preview from its latest prompt", async () => {
    const secondStart = "2026-08-08T00:02:00.000Z";
    const secondEnd = "2026-08-08T00:02:01.000Z";
    const multiTurn = view({
      meta: { ...view().meta, status: "idle" },
      turns: [
        view().turns[0],
        {
          ...view().turns[0],
          turnId: "turn-2",
          phase: "completed",
          startedAt: secondStart,
          lastActivityAt: secondEnd,
          createdAt: secondStart,
          updatedAt: secondEnd,
          responseId: "response-2",
        },
      ],
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "first prompt" }],
          metadata: { sessionId: "spawn-1", createdAt: new Date(now) },
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "first answer" }],
          metadata: { sessionId: "spawn-1", createdAt: new Date("2026-08-08T00:00:01.000Z") },
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "second prompt" }],
          metadata: { sessionId: "spawn-1", createdAt: new Date(secondStart) },
        },
        {
          id: "assistant-2",
          role: "assistant",
          parts: [{ type: "text", text: "second answer" }],
          metadata: { sessionId: "spawn-1", createdAt: new Date(secondEnd) },
        },
      ],
    });
    mocks.loadDetail.mockResolvedValue(multiTurn);

    const result = await new SpawnedSessionQueryService().getSpawnedSessionDetail({
      ...owner,
      sessionId: "spawn-1",
    });
    expect(result).toMatchObject({
      status: "ready",
      summary: { status: "idle", promptPreview: "second prompt" },
      turns: [
        {
          prompt: { text: "first prompt" },
          messages: [{ id: "assistant-1" }],
        },
        {
          prompt: { text: "second prompt" },
          messages: [{ id: "assistant-2" }],
        },
      ],
    });
  });

  it("lists a legacy Session from meta/latest turn without opening detail", async () => {
    const current = view();
    current.meta.status = "idle";
    current.turns[0].phase = "running";
    mocks.listSummaries.mockResolvedValue([{ meta: current.meta, latestTurn: current.turns[0] }]);
    mocks.loadDetail.mockClear();

    const result = await new SpawnedSessionQueryService().listSpawnedSessions(owner);
    expect(result).toMatchObject([{ sessionId: "spawn-1", status: "running" }]);
    expect(result[0]).not.toHaveProperty("promptPreview");
    expect(mocks.loadDetail).not.toHaveBeenCalled();
  });

  it("does not merge a stale live snapshot from another Turn", async () => {
    mocks.getInspectionSnapshot.mockReturnValue({
      turnId: "old-turn",
      mode: "background",
      startedAt: now,
      lastActivityAt: now,
      recentActivity: [{ kind: "stale", at: now }],
      liveAssistantMessage: {
        id: "stale-live",
        role: "assistant",
        parts: [{ type: "text", text: "stale" }],
        metadata: { sessionId: "spawn-1", createdAt: new Date(now) },
      },
    });
    const result = await new SpawnedSessionQueryService().getSpawnedSessionDetail({
      ...owner,
      sessionId: "spawn-1",
    });
    expect(result).toMatchObject({ turns: [{ messages: [] }] });
    expect(JSON.stringify(result)).not.toContain("stale-live");
  });
});
