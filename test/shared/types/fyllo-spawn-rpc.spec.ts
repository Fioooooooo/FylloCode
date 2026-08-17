import { describe, expect, it } from "vitest";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  MAX_RESPONSE_CHUNK_BYTES,
  cancelSessionResultSchema,
  checkSessionStatusResultSchema,
  fylloSpawnRpcMessageSchema,
  fylloSpawnRpcRequestSchema,
  promptToAgentParamsSchema,
  promptToAgentResultSchema,
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
    expect(fylloSpawnRpcRequestSchema.parse(request)).toEqual({
      ...request,
      params: { ...request.params, background: true },
    });
  });

  it("defaults prompt_to_agent to background mode", () => {
    expect(promptToAgentParamsSchema.parse(request.params)).toMatchObject({ background: true });
    expect(promptToAgentParamsSchema.parse({ ...request.params, background: false })).toMatchObject(
      {
        background: false,
      }
    );
  });

  it("accepts a strict background accepted snapshot without a response payload", () => {
    const accepted = {
      status: "accepted",
      sessionId: "spawn-1",
      turnId: "turn-1",
      startedAt: new Date().toISOString(),
      config: [],
      warnings: [],
    };
    expect(promptToAgentResultSchema.parse(accepted)).toEqual(accepted);
    expect(
      promptToAgentResultSchema.safeParse({ ...accepted, responseId: "response-1" }).success
    ).toBe(false);
    expect(promptToAgentResultSchema.safeParse({ ...accepted, content: "leak" }).success).toBe(
      false
    );
    expect(
      promptToAgentResultSchema.safeParse({ ...accepted, responsePath: "/tmp/response" }).success
    ).toBe(false);
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

  it("parses a cancel_session request and result", () => {
    expect(
      fylloSpawnRpcRequestSchema.safeParse({
        ...request,
        method: "cancel_session",
        params: { sessionId: "spawn-1" },
      }).success
    ).toBe(true);
    expect(
      cancelSessionResultSchema.safeParse({ cancelled: false, reason: "Session not found" }).success
    ).toBe(true);
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
        turnId: "turn-1",
        mode: "background",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        recentActivity: [activity, activity, activity],
      }).success
    ).toBe(true);
    expect(
      checkSessionStatusResultSchema.safeParse({
        status: "running",
        turnId: "turn-1",
        mode: "background",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        recentActivity: [activity, activity, activity, activity],
      }).success
    ).toBe(false);
  });

  it("parses interrupted status with stable restart codes", () => {
    expect(
      checkSessionStatusResultSchema.safeParse({
        status: "interrupted",
        code: "APP_RESTARTED",
        message: "Application restarted",
      }).success
    ).toBe(true);
    expect(
      checkSessionStatusResultSchema.safeParse({
        status: "interrupted",
        code: "TURN_FAILED",
        message: "wrong branch",
      }).success
    ).toBe(false);
  });
});
