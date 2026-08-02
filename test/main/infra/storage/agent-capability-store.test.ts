import { promises as fsPromises, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-agent-capabilities-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  getCachedAgentCapabilities,
  loadCache,
  removeAgentCapabilities,
  removeCustomAgentCapabilities,
  upsertAgentCapabilities,
} from "@main/infra/storage/agent-capability-store";

type CapabilitySource = Parameters<typeof upsertAgentCapabilities>[1];

const cachePath = `${tempRoot}/acp/agent-capabilities.json`;

const fullCapabilities = {
  authMethods: [
    {
      id: "login",
      name: "Agent Login",
      _meta: { agentAuth: { mode: "browser" } },
      futureAuthField: "preserved",
    },
    {
      type: "env_var",
      id: "api-key",
      name: "API Key",
      vars: [
        {
          name: "EXAMPLE_API_KEY",
          optional: false,
          secret: true,
          _meta: { provider: "example" },
          futureVarField: 1,
        },
      ],
    },
  ],
  promptCapabilities: {
    image: true,
    audio: false,
    embeddedContext: true,
    _meta: { promptAdapter: "agent-a" },
    futurePromptField: { enabled: true },
  },
  mcpCapabilities: {
    http: true,
    sse: false,
    acp: true,
    _meta: { transportAdapter: "agent-a" },
    futureMcpField: "preserved",
  },
  sessionCapabilities: {
    list: { _meta: { pagination: true }, futureListField: "preserved" },
    resume: {},
    close: null,
    _meta: { sessionAdapter: "agent-a" },
    futureSessionField: ["preserved"],
  },
} as unknown as CapabilitySource;

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-24T08:00:00.000Z"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("agent-capability-store", () => {
  it("returns empty cache when the file does not exist", async () => {
    await expect(loadCache()).resolves.toEqual({});
  });

  it("returns empty cache when the file is damaged or unsupported", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, "{ damaged", "utf8");
    await expect(loadCache()).resolves.toEqual({});

    writeFileSync(cachePath, JSON.stringify({ version: 99, agents: {} }), "utf8");
    await expect(loadCache()).resolves.toEqual({});
  });

  it("round-trips complete SDK-shaped capabilities and extension fields", async () => {
    await upsertAgentCapabilities("agent-a", fullCapabilities, "1.0.0");

    await expect(loadCache()).resolves.toEqual({
      "agent-a": {
        ...fullCapabilities,
        capabilityCompleteness: "complete",
        capturedAgentVersion: "1.0.0",
        capturedAt: "2026-05-24T08:00:00.000Z",
      },
    });

    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as { version: number };
    expect(raw.version).toBe(2);
  });

  it("keeps optional capability fields absent", async () => {
    await upsertAgentCapabilities("agent-empty", {}, "1.0.0");

    await expect(getCachedAgentCapabilities("agent-empty")).resolves.toEqual({
      capabilityCompleteness: "complete",
      capturedAgentVersion: "1.0.0",
      capturedAt: "2026-05-24T08:00:00.000Z",
    });
  });

  it("reads version 1 without rewriting and writes version 2 on the next upsert", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    const legacyDocument = {
      version: 1,
      agents: {
        "agent-a": {
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          capturedAgentVersion: "1.0.0",
          capturedAt: "2026-05-20T08:00:00.000Z",
        },
        "agent-b": {
          promptCapabilities: { image: false, audio: true, embeddedContext: false },
          capturedAgentVersion: "2.0.0",
          capturedAt: "2026-05-21T08:00:00.000Z",
        },
      },
    };
    const legacyJson = JSON.stringify(legacyDocument, null, 2);
    writeFileSync(cachePath, legacyJson, "utf8");

    await expect(loadCache()).resolves.toEqual({
      "agent-a": {
        ...legacyDocument.agents["agent-a"],
        capabilityCompleteness: "partial",
      },
      "agent-b": {
        ...legacyDocument.agents["agent-b"],
        capabilityCompleteness: "partial",
      },
    });
    expect(readFileSync(cachePath, "utf8")).toBe(legacyJson);

    await upsertAgentCapabilities("agent-a", fullCapabilities, "1.1.0");

    const upgraded = JSON.parse(readFileSync(cachePath, "utf8")) as {
      version: number;
      agents: Record<string, unknown>;
    };
    expect(upgraded.version).toBe(2);
    expect(upgraded.agents["agent-a"]).toMatchObject({
      ...fullCapabilities,
      capturedAgentVersion: "1.1.0",
    });
    expect(upgraded.agents["agent-b"]).toEqual({
      ...legacyDocument.agents["agent-b"],
      capabilityCompleteness: "partial",
    });

    await expect(loadCache()).resolves.toMatchObject({
      "agent-a": { capabilityCompleteness: "complete" },
      "agent-b": { capabilityCompleteness: "partial" },
    });
  });

  it("serializes concurrent upserts without dropping entries", async () => {
    await Promise.all([
      upsertAgentCapabilities("agent-a", { promptCapabilities: { image: true } }, "1.0.0"),
      upsertAgentCapabilities("agent-b", { mcpCapabilities: { http: true } }, "2.0.0"),
    ]);

    expect(await loadCache()).toMatchObject({
      "agent-a": {
        promptCapabilities: { image: true },
        capturedAgentVersion: "1.0.0",
      },
      "agent-b": {
        mcpCapabilities: { http: true },
        capturedAgentVersion: "2.0.0",
      },
    });
  });

  it("continues queued mutations after a write failure", async () => {
    vi.spyOn(fsPromises, "rename").mockRejectedValueOnce(new Error("rename failed"));

    await expect(
      upsertAgentCapabilities("agent-a", { promptCapabilities: { image: true } }, "1.0.0")
    ).rejects.toThrow("rename failed");
    await expect(
      upsertAgentCapabilities("agent-b", { mcpCapabilities: { http: true } }, "2.0.0")
    ).resolves.toBeUndefined();

    expect(await loadCache()).toMatchObject({
      "agent-b": {
        mcpCapabilities: { http: true },
        capturedAgentVersion: "2.0.0",
      },
    });
  });

  it("stores custom agent snapshots with an empty captured version", async () => {
    await upsertAgentCapabilities(
      "custom-kimi-acp-7f3a9e2d",
      { promptCapabilities: { image: true } },
      ""
    );

    await expect(getCachedAgentCapabilities("custom-kimi-acp-7f3a9e2d")).resolves.toMatchObject({
      promptCapabilities: { image: true },
      capturedAgentVersion: "",
    });
  });

  it("removes one agent or all custom agent snapshots", async () => {
    await upsertAgentCapabilities(
      "custom-kimi-acp-7f3a9e2d",
      { promptCapabilities: { image: true } },
      ""
    );
    await upsertAgentCapabilities("agent-a", { mcpCapabilities: { http: true } }, "1.0.0");
    await upsertAgentCapabilities("agent-b", { sessionCapabilities: { list: {} } }, "2.0.0");

    await removeCustomAgentCapabilities();
    await removeAgentCapabilities("agent-a");

    const cache = await loadCache();
    expect(cache["custom-kimi-acp-7f3a9e2d"]).toBeUndefined();
    expect(cache["agent-a"]).toBeUndefined();
    expect(cache["agent-b"]).toBeDefined();
  });
});
