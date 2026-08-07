import { describe, expect, it } from "vitest";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  MAX_RESPONSE_CHUNK_BYTES,
  checkSessionStatusResultSchema,
  fylloSpawnRpcMessageSchema,
  fylloSpawnRpcRequestSchema,
  readResponseParamsSchema,
} from "@shared/types/fyllo-spawn-rpc";

const request = {
  protocol: FYLLO_SPAWN_RPC_PROTOCOL,
  version: FYLLO_SPAWN_RPC_VERSION,
  kind: "request" as const,
  requestId: "request-1",
  method: "prompt_to_agent" as const,
  caller: { workspaceId: "workspace-1", parentSessionId: "parent-1" },
  params: { agentId: "agent-1", prompt: "Inspect the repository" },
};

describe("fyllo-spawn RPC contract", () => {
  it("parses a method-specific request", () => {
    expect(fylloSpawnRpcRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects unknown protocol versions and message kinds", () => {
    expect(fylloSpawnRpcMessageSchema.safeParse({ ...request, version: 2 }).success).toBe(false);
    expect(fylloSpawnRpcMessageSchema.safeParse({ ...request, kind: "event" }).success).toBe(false);
  });

  it("requires caller identity exactly once and rejects caller identity in params", () => {
    expect(
      fylloSpawnRpcRequestSchema.safeParse({ ...request, caller: { workspaceId: "workspace-1" } })
        .success
    ).toBe(false);
    expect(
      fylloSpawnRpcRequestSchema.safeParse({
        ...request,
        params: { ...request.params, workspaceId: "forged-workspace" },
      }).success
    ).toBe(false);
  });

  it("enforces opaque cursor and response chunk limits", () => {
    expect(
      readResponseParamsSchema.safeParse({
        sessionId: "spawn-1",
        responseId: "response-1",
        maxBytes: MAX_RESPONSE_CHUNK_BYTES,
      }).success
    ).toBe(true);
    expect(
      readResponseParamsSchema.safeParse({
        sessionId: "spawn-1",
        responseId: "response-1",
        maxBytes: MAX_RESPONSE_CHUNK_BYTES + 1,
      }).success
    ).toBe(false);
    expect(
      readResponseParamsSchema.safeParse({
        sessionId: "spawn-1",
        responseId: "response-1",
        cursor: "x".repeat(257),
      }).success
    ).toBe(false);
  });

  it("limits running status activity snapshots to three entries", () => {
    const activity = { kind: "text_delta", at: new Date().toISOString() };
    expect(
      checkSessionStatusResultSchema.safeParse({
        status: "running",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        recentActivity: [activity, activity, activity],
      }).success
    ).toBe(true);
    expect(
      checkSessionStatusResultSchema.safeParse({
        status: "running",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        recentActivity: [activity, activity, activity, activity],
      }).success
    ).toBe(false);
  });
});
