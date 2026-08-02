import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateAcpSession } from "@main/services/session/chat/acp-session-activation";

const mocks = vi.hoisted(() => ({
  markAcpSessionActive: vi.fn((entry: { activeSessionIds: Set<string> }, sessionId: string) => {
    entry.activeSessionIds.add(sessionId);
  }),
  forgetActiveAcpSession: vi.fn((entry: { activeSessionIds: Set<string> }, sessionId: string) => {
    entry.activeSessionIds.delete(sessionId);
  }),
}));

vi.mock("@main/infra/process/acp-process-pool", () => ({
  markAcpSessionActive: mocks.markAcpSessionActive,
  forgetActiveAcpSession: mocks.forgetActiveAcpSession,
}));

function missingError(): Error & { code: number } {
  return Object.assign(new Error("session not found"), { code: -32001 });
}

function createEntry() {
  return {
    connection: {
      resumeSession: vi.fn(),
      loadSession: vi.fn(),
      newSession: vi.fn(),
    },
    activeSessionIds: new Set<string>(),
  };
}

function params(
  entry: ReturnType<typeof createEntry>,
  overrides: Partial<Parameters<typeof activateAcpSession>[0]> = {}
): Parameters<typeof activateAcpSession>[0] {
  return {
    entry: entry as never,
    initializeResponse: {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { resume: {} },
      },
    },
    persistedSessionId: "acp-old",
    cwd: "/tmp/project",
    additionalDirectories: ["/tmp/secondary"],
    createMcpActivation: vi.fn(async () => ({
      mcpServers: [{ name: "fyllo", command: "node", args: [], env: [] }],
      mcpActivationId: "activation-1",
      revoke: vi.fn(),
    })),
    allowFreshSession: true,
    ...overrides,
  };
}

describe("acp-session-activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers resume and marks the session active", async () => {
    const entry = createEntry();
    entry.connection.resumeSession.mockResolvedValue({ configOptions: [] });

    await expect(activateAcpSession(params(entry))).resolves.toMatchObject({
      sessionId: "acp-old",
      strategy: "resume_session",
      createdNewSession: false,
    });
    expect(entry.connection.resumeSession).toHaveBeenCalledWith({
      sessionId: "acp-old",
      cwd: "/tmp/project",
      additionalDirectories: ["/tmp/secondary"],
      mcpServers: [{ name: "fyllo", command: "node", args: [], env: [] }],
    });
    expect(entry.activeSessionIds.has("acp-old")).toBe(true);
    expect(mocks.markAcpSessionActive).toHaveBeenCalledWith(
      expect.anything(),
      "acp-old",
      "activation-1"
    );
    expect(entry.connection.loadSession).not.toHaveBeenCalled();
  });

  it("falls back from a missing resume to load and brackets replay callbacks", async () => {
    const entry = createEntry();
    entry.connection.resumeSession.mockRejectedValue(missingError());
    entry.connection.loadSession.mockResolvedValue({ configOptions: [] });
    const onLoadStart = vi.fn();
    const onLoadFinish = vi.fn();

    await expect(
      activateAcpSession(params(entry, { onLoadStart, onLoadFinish }))
    ).resolves.toMatchObject({ strategy: "load_session" });
    expect(onLoadStart).toHaveBeenCalledWith("acp-old");
    expect(onLoadFinish).toHaveBeenCalledWith("acp-old");
    expect(entry.connection.loadSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ["/tmp/secondary"] })
    );
    expect(entry.activeSessionIds.has("acp-old")).toBe(true);
  });

  it("fails immediately on a non-missing resume error", async () => {
    const entry = createEntry();
    const failure = new Error("permission denied");
    entry.connection.resumeSession.mockRejectedValue(failure);

    await expect(activateAcpSession(params(entry))).rejects.toBe(failure);
    expect(entry.connection.loadSession).not.toHaveBeenCalled();
    expect(entry.connection.newSession).not.toHaveBeenCalled();
  });

  it("checks cancellation before falling through to another strategy", async () => {
    const entry = createEntry();
    entry.connection.resumeSession.mockRejectedValue(missingError());
    const checkCancelled = vi.fn((stage: string) => {
      if (stage === "after failed resumeSession") {
        throw new Error("cancelled");
      }
    });

    await expect(activateAcpSession(params(entry, { checkCancelled }))).rejects.toThrow(
      "cancelled"
    );
    expect(entry.connection.loadSession).not.toHaveBeenCalled();
    expect(entry.connection.newSession).not.toHaveBeenCalled();
  });

  it("creates a fresh session after missing resume and load and switches the marker", async () => {
    const entry = createEntry();
    entry.activeSessionIds.add("acp-old");
    entry.connection.resumeSession.mockRejectedValue(missingError());
    entry.connection.loadSession.mockRejectedValue(missingError());
    entry.connection.newSession.mockResolvedValue({
      sessionId: "acp-new",
      configOptions: [],
    });

    let activationSequence = 0;
    const revocations: Array<ReturnType<typeof vi.fn>> = [];
    const createMcpActivation = vi.fn(async () => {
      activationSequence += 1;
      const revoke = vi.fn();
      revocations.push(revoke);
      return {
        mcpServers: [{ name: `fyllo-${activationSequence}`, command: "node", args: [], env: [] }],
        mcpActivationId: `activation-${activationSequence}`,
        revoke,
      };
    });

    await expect(activateAcpSession(params(entry, { createMcpActivation }))).resolves.toMatchObject(
      {
        sessionId: "acp-new",
        previousSessionId: "acp-old",
        strategy: "fresh_fallback",
        createdNewSession: true,
      }
    );
    expect(entry.activeSessionIds.has("acp-old")).toBe(false);
    expect(entry.activeSessionIds.has("acp-new")).toBe(true);
    expect(entry.connection.newSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ["/tmp/secondary"] })
    );
    expect(createMcpActivation).toHaveBeenCalledTimes(3);
    expect(entry.connection.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [expect.objectContaining({ name: "fyllo-1" })],
      })
    );
    expect(entry.connection.loadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [expect.objectContaining({ name: "fyllo-2" })],
      })
    );
    expect(entry.connection.newSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [expect.objectContaining({ name: "fyllo-3" })],
      })
    );
    expect(revocations[0]).toHaveBeenCalledOnce();
    expect(revocations[1]).toHaveBeenCalledOnce();
    expect(revocations[2]).not.toHaveBeenCalled();
    expect(mocks.markAcpSessionActive).toHaveBeenLastCalledWith(
      expect.anything(),
      "acp-new",
      "activation-3"
    );
  });

  it("does not create a fresh session for cold config mutation", async () => {
    const entry = createEntry();
    entry.connection.resumeSession.mockRejectedValue(missingError());
    entry.connection.loadSession.mockRejectedValue(missingError());

    await expect(activateAcpSession(params(entry, { allowFreshSession: false }))).rejects.toThrow(
      "session not found"
    );
    expect(entry.connection.newSession).not.toHaveBeenCalled();
  });

  it("creates a new session directly when no persisted session exists", async () => {
    const entry = createEntry();
    entry.connection.newSession.mockResolvedValue({
      sessionId: "acp-new",
      configOptions: [],
    });

    await expect(
      activateAcpSession(params(entry, { persistedSessionId: null }))
    ).resolves.toMatchObject({
      sessionId: "acp-new",
      strategy: "new_session",
    });
    expect(entry.connection.resumeSession).not.toHaveBeenCalled();
    expect(entry.connection.loadSession).not.toHaveBeenCalled();
    expect(entry.connection.newSession).toHaveBeenCalledWith(
      expect.objectContaining({ additionalDirectories: ["/tmp/secondary"] })
    );
  });
});
