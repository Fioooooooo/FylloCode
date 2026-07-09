import { afterEach, describe, expect, it } from "vitest";
import {
  sessionProbeRegistry,
  toProbeSnapshot,
  type ProbeEntry,
} from "@main/services/session/chat/session-probe-registry";

function makeEntry(overrides: Partial<ProbeEntry> = {}): ProbeEntry {
  return {
    projectId: "project-1",
    agentId: "claude-code",
    status: "ready",
    fylloSessionId: "session-probe",
    acpSessionId: "acp-1",
    configOptions: [],
    availableCommands: [],
    startedAt: 0,
    ...overrides,
  };
}

describe("session-probe-registry", () => {
  afterEach(() => {
    sessionProbeRegistry.clear();
  });

  it("toProbeSnapshot maps availableCommands and fylloSessionId", () => {
    const entry = makeEntry({
      fylloSessionId: "session-P",
      availableCommands: [{ name: "init", description: "Initialize" }],
    });

    const snapshot = toProbeSnapshot(entry);

    expect(snapshot.availableCommands).toEqual([{ name: "init", description: "Initialize" }]);
    expect(snapshot.fylloSessionId).toBe("session-P");
  });

  it("set/get round-trips availableCommands", () => {
    const entry = makeEntry({
      availableCommands: [{ name: "review", description: "Review" }],
    });
    sessionProbeRegistry.set("project-1", "claude-code", entry);

    expect(sessionProbeRegistry.get("project-1", "claude-code")?.availableCommands).toEqual([
      { name: "review", description: "Review" },
    ]);
  });

  it("keeps entries for the same agent isolated by project", () => {
    const projectAEntry = makeEntry({
      projectId: "project-a",
      acpSessionId: "acp-a",
      availableCommands: [{ name: "a", description: "Project A" }],
    });
    const projectBEntry = makeEntry({
      projectId: "project-b",
      acpSessionId: "acp-b",
      availableCommands: [{ name: "b", description: "Project B" }],
    });

    sessionProbeRegistry.set("project-a", "claude-code", projectAEntry);
    sessionProbeRegistry.set("project-b", "claude-code", projectBEntry);

    expect(sessionProbeRegistry.get("project-a", "claude-code")?.acpSessionId).toBe("acp-a");
    expect(sessionProbeRegistry.get("project-b", "claude-code")?.acpSessionId).toBe("acp-b");
  });

  it("takeFor returns the entry with availableCommands when acpSessionId matches", () => {
    const entry = makeEntry({
      acpSessionId: "acp-x",
      availableCommands: [{ name: "plan", description: "Plan" }],
    });
    sessionProbeRegistry.set("project-1", "claude-code", entry);

    const taken = sessionProbeRegistry.takeFor("project-1", "claude-code", "acp-x");

    expect(taken?.availableCommands).toEqual([{ name: "plan", description: "Plan" }]);
    expect(taken?.fylloSessionId).toBe("session-probe");
    expect(sessionProbeRegistry.get("project-1", "claude-code")).toBeUndefined();
  });
});
