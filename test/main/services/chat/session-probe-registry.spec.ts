import { afterEach, describe, expect, it } from "vitest";
import {
  sessionProbeRegistry,
  toProbeSnapshot,
  type ProbeEntry,
} from "@main/services/chat/session-probe-registry";

function makeEntry(overrides: Partial<ProbeEntry> = {}): ProbeEntry {
  return {
    agentId: "claude-code",
    status: "ready",
    acpSessionId: "acp-1",
    configOptions: [],
    availableCommands: [],
    startedAt: 0,
    ...overrides,
  };
}

describe("session-probe-registry", () => {
  afterEach(() => {
    for (const key of sessionProbeRegistry.keys()) {
      sessionProbeRegistry.delete(key);
    }
  });

  it("toProbeSnapshot maps availableCommands", () => {
    const entry = makeEntry({
      availableCommands: [{ name: "init", description: "Initialize" }],
    });

    const snapshot = toProbeSnapshot(entry);

    expect(snapshot.availableCommands).toEqual([{ name: "init", description: "Initialize" }]);
  });

  it("set/get round-trips availableCommands", () => {
    const entry = makeEntry({
      availableCommands: [{ name: "review", description: "Review" }],
    });
    sessionProbeRegistry.set("claude-code", entry);

    expect(sessionProbeRegistry.get("claude-code")?.availableCommands).toEqual([
      { name: "review", description: "Review" },
    ]);
  });

  it("takeFor returns the entry with availableCommands when acpSessionId matches", () => {
    const entry = makeEntry({
      acpSessionId: "acp-x",
      availableCommands: [{ name: "plan", description: "Plan" }],
    });
    sessionProbeRegistry.set("claude-code", entry);

    const taken = sessionProbeRegistry.takeFor("claude-code", "acp-x");

    expect(taken?.availableCommands).toEqual([{ name: "plan", description: "Plan" }]);
    expect(sessionProbeRegistry.get("claude-code")).toBeUndefined();
  });
});
