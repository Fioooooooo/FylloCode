import { describe, expect, it } from "vitest";
import {
  spawnedSessionDetailInputSchema,
  spawnedSessionDetailResultSchema,
  spawnedSessionDisplayStatusSchema,
  spawnedSessionListInputSchema,
  spawnedSessionListResultSchema,
} from "@shared/ipc/session/spawned-session.schemas";

const summary = {
  sessionId: "spawn-1",
  agent: { agentId: "codex", name: "Codex" },
  status: "running" as const,
  mode: "background" as const,
  currentTurnId: "turn-1",
  startedAt: "2026-08-08T00:00:00.000Z",
  lastActivityAt: "2026-08-08T00:00:01.000Z",
  updatedAt: "2026-08-08T00:00:01.000Z",
  promptPreview: "Inspect the code",
};

describe("spawned Session inspection schemas", () => {
  it("accepts strict owner-scoped list and detail inputs", () => {
    expect(
      spawnedSessionListInputSchema.parse({ workspaceId: "workspace-1", parentSessionId: "p-1" })
    ).toEqual({ workspaceId: "workspace-1", parentSessionId: "p-1" });
    expect(
      spawnedSessionDetailInputSchema.parse({
        workspaceId: "workspace-1",
        parentSessionId: "p-1",
        sessionId: "spawn-1",
      })
    ).toMatchObject({ sessionId: "spawn-1" });
  });

  it("rejects caller-provided authorization and path fields", () => {
    expect(
      spawnedSessionDetailInputSchema.safeParse({
        workspaceId: "workspace-1",
        parentSessionId: "p-1",
        sessionId: "spawn-1",
        agentId: "fake",
        path: "/private/data",
      }).success
    ).toBe(false);
  });

  it("exposes exactly the six public display states", () => {
    expect(spawnedSessionDisplayStatusSchema.options).toEqual([
      "starting",
      "running",
      "idle",
      "error",
      "expired",
      "interrupted",
    ]);
    expect(spawnedSessionDisplayStatusSchema.safeParse("cancelling").success).toBe(false);
  });

  it("accepts list summaries and ready/not_found details", () => {
    expect(spawnedSessionListResultSchema.parse([summary])).toEqual([summary]);
    expect(
      spawnedSessionDetailResultSchema.parse({
        status: "ready",
        summary,
        turns: [
          {
            turnId: "turn-1",
            ordinal: 1,
            mode: "background",
            status: "running",
            startedAt: "2026-08-08T00:00:00.000Z",
            lastActivityAt: "2026-08-08T00:00:01.000Z",
            updatedAt: "2026-08-08T00:00:01.000Z",
            recentActivity: [],
            prompt: { text: "Inspect the code" },
            messages: [
              {
                id: "assistant-1",
                role: "assistant",
                createdAt: "2026-08-08T00:00:01.000Z",
                durable: false,
                parts: [
                  { type: "reasoning", text: "Checking" },
                  {
                    type: "dynamic-tool",
                    toolCallId: "tool-1",
                    toolName: "Read",
                    state: "input-available",
                    input: {},
                  },
                  { type: "text", text: "Working" },
                ],
              },
            ],
          },
        ],
      })
    ).toMatchObject({ status: "ready" });
    expect(spawnedSessionDetailResultSchema.parse({ status: "not_found" })).toEqual({
      status: "not_found",
    });
  });

  it("rejects live messages claimed as durable=false only when assistant and any path projection", () => {
    const ready = {
      status: "ready",
      summary,
      turns: [
        {
          turnId: "turn-1",
          ordinal: 1,
          mode: "background",
          status: "running",
          startedAt: "2026-08-08T00:00:00.000Z",
          lastActivityAt: "2026-08-08T00:00:01.000Z",
          updatedAt: "2026-08-08T00:00:01.000Z",
          recentActivity: [],
          messages: [
            {
              id: "user-1",
              role: "user",
              createdAt: "2026-08-08T00:00:00.000Z",
              durable: false,
              parts: [{ type: "text", text: "Prompt" }],
            },
          ],
        },
      ],
    };
    expect(spawnedSessionDetailResultSchema.safeParse(ready).success).toBe(false);
    expect(
      spawnedSessionListResultSchema.safeParse([{ ...summary, responsePath: "/tmp/response.md" }])
        .success
    ).toBe(false);
  });
});
