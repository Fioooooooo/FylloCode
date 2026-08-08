import { describe, expect, it } from "vitest";
import {
  isActiveBackgroundSession,
  projectSpawnedSessionContent,
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

  it("recognizes only starting/running background summaries", () => {
    const base = {
      sessionId: "spawn-1",
      agent: { agentId: "agent-1", name: "Agent" },
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    expect(isActiveBackgroundSession({ ...base, mode: "background", status: "running" })).toBe(
      true
    );
    expect(isActiveBackgroundSession({ ...base, mode: "sync", status: "running" })).toBe(false);
    expect(isActiveBackgroundSession({ ...base, mode: "background", status: "idle" })).toBe(false);
  });
});
