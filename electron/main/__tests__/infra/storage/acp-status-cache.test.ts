import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpAgentStatus, AcpStatusCache } from "@shared/types/acp-agent";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-acp-status-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { readStatusCache, writeStatusCache } from "@main/infra/storage/acp-status-cache";

const cachePath = `${tempRoot}/acp/status-cache.json`;

function createStatuses(): AcpAgentStatus[] {
  return [
    {
      id: "claude-acp",
      installed: true,
      detectedVersion: "1.2.0",
      managedBy: "fyllocode",
      installMethod: "npx",
      updateAvailable: true,
      latestVersion: "1.3.0",
    },
    {
      id: "glm-acp-agent",
      installed: false,
      managedBy: null,
      updateAvailable: false,
      latestVersion: "2.0.0",
    },
  ];
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-30T08:00:00.000Z"));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("acp-status-cache", () => {
  it("returns null when the cache file is missing", async () => {
    expect(await readStatusCache()).toBeNull();
  });

  it("returns null when the cache file is corrupted", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, "{ not valid json", "utf8");

    expect(await readStatusCache()).toBeNull();
  });

  it("returns null when statuses is not an array", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: 1, statuses: {} }), "utf8");

    expect(await readStatusCache()).toBeNull();
  });

  it("writes statuses with a fetchedAt timestamp and reads them back", async () => {
    const statuses = createStatuses();

    await writeStatusCache(statuses);

    const written = JSON.parse(readFileSync(cachePath, "utf8")) as AcpStatusCache;
    expect(written.fetchedAt).toBe(new Date("2026-05-30T08:00:00.000Z").getTime());
    expect(written.statuses).toEqual(statuses);

    const cached = await readStatusCache();
    expect(cached?.statuses).toEqual(statuses);
  });
});
