import { describe, expect, it } from "vitest";
import {
  isActiveSpawnedSession,
  projectSpawnedSessionContent,
  sortSpawnedSessionSummaries,
  spawnedSessionActivityStats,
  spawnedSessionStatusPresentation,
} from "@renderer/features/spawned-session-inspector";

describe("spawned Session inspector projection", () => {
  it("separates reasoning/tools from text while preserving Markdown text", () => {
    const projection = projectSpawnedSessionContent([
      {
        id: "assistant-1",
        role: "assistant",
        durable: true,
        createdAt: "2026-08-08T00:00:00.000Z",
        parts: [
          { type: "text", text: "*kept italic*" },
          { type: "reasoning", text: "Think" },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "Read",
            state: "output-available",
            output: "done",
          },
          { type: "text", text: "Final" },
        ],
      },
    ]);
    expect(projection.transcript.map((entry) => entry.text)).toEqual(["*kept italic*", "Final"]);
    expect(projection.activities.map((entry) => entry.part.type)).toEqual([
      "reasoning",
      "dynamic-tool",
    ]);
  });

  it("projects all six statuses with text and icon", () => {
    for (const status of [
      "starting",
      "running",
      "idle",
      "error",
      "expired",
      "interrupted",
    ] as const) {
      expect(spawnedSessionStatusPresentation(status)).toMatchObject({
        label: expect.any(String),
        icon: expect.stringContaining("i-lucide"),
      });
    }
  });

  it("recognizes active status independently of sync/background mode", () => {
    const base = {
      sessionId: "spawn-1",
      agent: { agentId: "agent-1", name: "Agent" },
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    expect(isActiveSpawnedSession({ ...base, mode: "background", status: "running" })).toBe(true);
    expect(isActiveSpawnedSession({ ...base, mode: "sync", status: "running" })).toBe(true);
    expect(isActiveSpawnedSession({ ...base, mode: "background", status: "idle" })).toBe(false);
  });

  it("sorts active first and counts all owner-matched Sessions", () => {
    const base = {
      agent: { agentId: "agent-1", name: "Agent" },
    };
    const summaries = [
      {
        ...base,
        sessionId: "terminal",
        status: "idle" as const,
        updatedAt: "2026-08-08T00:03:00.000Z",
      },
      {
        ...base,
        sessionId: "sync",
        status: "running" as const,
        mode: "sync" as const,
        updatedAt: "2026-08-08T00:01:00.000Z",
      },
      {
        ...base,
        sessionId: "background",
        status: "starting" as const,
        mode: "background" as const,
        updatedAt: "2026-08-08T00:02:00.000Z",
      },
    ];
    expect(sortSpawnedSessionSummaries(summaries).map((item) => item.sessionId)).toEqual([
      "background",
      "sync",
      "terminal",
    ]);
    expect(spawnedSessionActivityStats(summaries)).toEqual({ total: 3, active: 2 });
  });
});
