import { rmSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-chat-acp-session-store-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";
import { loadSessionMeta, saveSessionMeta } from "@main/infra/storage/session-store";

const projectPath = "/tmp/project";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    agentId: "agent-0",
    title: "Session",
    turnCount: 2,
    tokenUsage: { used: 11, size: 22 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-18T08:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("chat-acp-session-store", () => {
  it("returns null when session meta is missing", async () => {
    const store = new ChatAcpSessionStore(projectPath, "session-1", "agent-1");

    await expect(store.loadAcpSessionId()).resolves.toBeNull();
  });

  it("loads acpSessionId from session meta", async () => {
    await saveSessionMeta(projectPath, meta({ acpSessionId: "acp-existing" }));

    const store = new ChatAcpSessionStore(projectPath, "session-1", "agent-1");

    await expect(store.loadAcpSessionId()).resolves.toBe("acp-existing");
  });

  it("creates session meta when persisting for the first time", async () => {
    const store = new ChatAcpSessionStore(projectPath, "session-1", "agent-1");

    await store.persistAcpSessionId("acp-new");

    const saved = await loadSessionMeta(projectPath, "session-1");

    expect(saved).toMatchObject({
      sessionId: "session-1",
      acpSessionId: "acp-new",
      agentId: "agent-1",
      title: "New Session",
      turnCount: 1,
      tokenUsage: { used: 0, size: 0 },
      createdAt: "2026-05-18T08:00:00.000Z",
      updatedAt: "2026-05-18T08:00:00.000Z",
    });
    expect(saved?.available_commands).toBeUndefined();
    expect(saved?.tokenUsage.cost).toBeUndefined();
  });

  it("preserves existing fields while updating acpSessionId", async () => {
    await saveSessionMeta(
      projectPath,
      meta({
        acpSessionId: "acp-old",
        available_commands: [{ name: "review", description: "Review code" }],
        tokenUsage: {
          used: 42,
          size: 2048,
          cost: { amount: 1.5, currency: "USD" },
        },
      })
    );

    const store = new ChatAcpSessionStore(projectPath, "session-1", "agent-1");

    await store.persistAcpSessionId("acp-new");

    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toEqual({
      sessionId: "session-1",
      acpSessionId: "acp-new",
      agentId: "agent-1",
      title: "Session",
      turnCount: 3,
      tokenUsage: {
        used: 42,
        size: 2048,
        cost: { amount: 1.5, currency: "USD" },
      },
      available_commands: [{ name: "review", description: "Review code" }],
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-18T08:00:00.000Z",
    });
  });
});
