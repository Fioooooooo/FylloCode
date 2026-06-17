import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
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
  getCachedPromptCapabilities,
  loadCache,
  removeCustomAgentCapabilities,
  upsertPromptCapabilities,
} from "@main/infra/storage/agent-capability-store";

const cachePath = `${tempRoot}/acp/agent-capabilities.json`;

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-24T08:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("agent-capability-store", () => {
  it("returns empty cache when the file does not exist", async () => {
    await expect(loadCache()).resolves.toEqual({});
  });

  it("returns empty cache when the file is damaged", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, "{ damaged", "utf8");

    await expect(loadCache()).resolves.toEqual({});
  });

  it("upserts multiple agents without dropping existing entries", async () => {
    await upsertPromptCapabilities(
      "agent-a",
      { image: true, audio: false, embeddedContext: false },
      "1.0.0"
    );
    await upsertPromptCapabilities(
      "agent-b",
      { image: false, audio: true, embeddedContext: true },
      "2.0.0"
    );

    expect(await loadCache()).toMatchObject({
      "agent-a": {
        promptCapabilities: { image: true, audio: false, embeddedContext: false },
        capturedAgentVersion: "1.0.0",
      },
      "agent-b": {
        promptCapabilities: { image: false, audio: true, embeddedContext: true },
        capturedAgentVersion: "2.0.0",
      },
    });

    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as { version: number };
    expect(raw.version).toBe(1);
  });

  it("overwrites cached capabilities and captured version for the same agent", async () => {
    await upsertPromptCapabilities(
      "agent-a",
      { image: false, audio: false, embeddedContext: false },
      "1.0.0"
    );
    await upsertPromptCapabilities(
      "agent-a",
      { image: true, audio: true, embeddedContext: true },
      "1.1.0"
    );

    await expect(getCachedPromptCapabilities("agent-a")).resolves.toEqual({
      capabilities: { image: true, audio: true, embeddedContext: true },
      capturedAgentVersion: "1.1.0",
    });
  });

  it("stores custom agent capabilities with empty captured version", async () => {
    await upsertPromptCapabilities(
      "custom-kimi-acp-7f3a9e2d",
      { image: true, audio: false, embeddedContext: false },
      ""
    );

    await expect(getCachedPromptCapabilities("custom-kimi-acp-7f3a9e2d")).resolves.toEqual({
      capabilities: { image: true, audio: false, embeddedContext: false },
      capturedAgentVersion: "",
    });
  });

  it("removes all custom agent capabilities", async () => {
    await upsertPromptCapabilities(
      "custom-kimi-acp-7f3a9e2d",
      { image: true, audio: false, embeddedContext: false },
      ""
    );
    await upsertPromptCapabilities(
      "agent-a",
      { image: false, audio: true, embeddedContext: true },
      "1.0.0"
    );

    await removeCustomAgentCapabilities();

    const cache = await loadCache();
    expect(cache["custom-kimi-acp-7f3a9e2d"]).toBeUndefined();
    expect(cache["agent-a"]).toBeDefined();
  });
});
