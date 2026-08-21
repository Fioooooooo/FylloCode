import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { net } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpRegistry, AcpRegistryCache } from "@shared/types/acp-agent";

const { invalidateChangedIcons, tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    invalidateChangedIcons: vi.fn(async () => {}),
    tempRoot: createTestTempRoot("fyllocode-acp-registry-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/storage/acp-icon-cache", () => ({
  invalidateChangedIcons,
}));

import {
  CURATED_REGISTRY_URL,
  getRegistry,
  readRegistryCache,
  refreshRegistry,
} from "@main/infra/storage/acp-registry-cache";

const cachePath = `${tempRoot}/acp/registry-cache.json`;

function createRegistry(): AcpRegistry {
  return {
    version: "1.0.0",
    curation: { channel: "curated" },
    agents: [
      {
        id: "claude-acp",
        name: "Claude",
        version: "1.0.0",
        description: "Claude adapter",
        authors: ["Anthropic"],
        license: "MIT",
        distribution: { npx: { package: "@anthropic-ai/claude-acp" } },
      },
      {
        id: "codex-acp",
        name: "Codex",
        version: "1.0.0",
        description: "Codex adapter",
        authors: ["OpenAI"],
        license: "MIT",
        distribution: { npx: { package: "@openai/codex-acp" } },
      },
      {
        id: "amp-acp",
        name: "Amp",
        version: "1.0.0",
        description: "Amp adapter",
        authors: ["Amp"],
        license: "MIT",
        distribution: { npx: { package: "@amp/amp-acp" } },
      },
      {
        id: "pi-acp",
        name: "Pi",
        version: "1.0.0",
        description: "Pi bridge",
        authors: ["Inflection"],
        license: "MIT",
        distribution: { binary: { darwin: { archive: "pi.zip", cmd: "pi" } } },
      },
      {
        id: "glm-acp-agent",
        name: "GLM",
        version: "1.0.0",
        description: "GLM native",
        authors: ["Zhipu"],
        license: "MIT",
        distribution: { uvx: { package: "glm-acp-agent" } },
      },
    ],
  };
}

function writeCache(
  data: AcpRegistry,
  fetchedAt = new Date().toISOString(),
  source = CURATED_REGISTRY_URL
): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  const payload: AcpRegistryCache = {
    source,
    fetchedAt,
    data,
  };
  writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf8");
}

function writeLegacyCache(data: AcpRegistry, fetchedAt = new Date().toISOString()): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify({ fetchedAt, data }, null, 2), "utf8");
}

function mockFetchResponse(data: AcpRegistry): void {
  vi.mocked(net.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
  } as Response);
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

describe("acp-registry-cache", () => {
  it("injects kinds when getRegistry returns cached data", async () => {
    const rawRegistry = createRegistry();
    writeCache(rawRegistry);

    const result = await getRegistry();

    expect(result).not.toBe(rawRegistry);
    expect(result.agents.map((agent) => [agent.id, agent.__fyllo?.kind])).toEqual([
      ["claude-acp", "adapter"],
      ["codex-acp", "adapter"],
      ["amp-acp", "adapter"],
      ["pi-acp", "bridge"],
      ["glm-acp-agent", "native"],
    ]);
    expect(rawRegistry.agents.every((agent) => agent.__fyllo === undefined)).toBe(true);
  });

  it("injects kinds when refreshRegistry fetches from network", async () => {
    const rawRegistry = createRegistry();
    mockFetchResponse(rawRegistry);

    const result = await refreshRegistry();

    expect(net.fetch).toHaveBeenCalledWith(CURATED_REGISTRY_URL);

    expect(result.agents.map((agent) => [agent.id, agent.__fyllo?.kind])).toEqual([
      ["claude-acp", "adapter"],
      ["codex-acp", "adapter"],
      ["amp-acp", "adapter"],
      ["pi-acp", "bridge"],
      ["glm-acp-agent", "native"],
    ]);
  });

  it("writes raw registry data to disk without __fyllo metadata", async () => {
    const rawRegistry = createRegistry();
    mockFetchResponse(rawRegistry);

    await refreshRegistry();

    const written = JSON.parse(readFileSync(cachePath, "utf8")) as AcpRegistryCache;
    expect(written.source).toBe(CURATED_REGISTRY_URL);
    expect(written.data.curation).toEqual({ channel: "curated" });
    expect(
      written.data.agents.every((agent) => !Object.prototype.hasOwnProperty.call(agent, "__fyllo"))
    ).toBe(true);

    const cached = await readRegistryCache();
    expect(cached?.data.agents.every((agent) => agent.__fyllo === undefined)).toBe(true);
  });

  it("ignores a legacy cache without source and refreshes the curated registry", async () => {
    const rawRegistry = createRegistry();
    writeLegacyCache(rawRegistry);
    mockFetchResponse(rawRegistry);

    const cached = await readRegistryCache();
    expect(cached?.data.agents.every((agent) => agent.__fyllo === undefined)).toBe(true);
    expect(cached?.source).toBeUndefined();

    const result = await getRegistry();
    expect(net.fetch).toHaveBeenCalledWith(CURATED_REGISTRY_URL);
    expect(result.agents.find((agent) => agent.id === "pi-acp")?.__fyllo?.kind).toBe("bridge");
    expect(result.agents.find((agent) => agent.id === "glm-acp-agent")?.__fyllo?.kind).toBe(
      "native"
    );
  });

  it("ignores a cache from another source even while it is fresh", async () => {
    const rawRegistry = createRegistry();
    writeCache(rawRegistry, new Date().toISOString(), "https://official.example/registry.json");
    mockFetchResponse(rawRegistry);

    await expect(getRegistry()).resolves.toMatchObject({ agents: rawRegistry.agents });
    expect(net.fetch).toHaveBeenCalledTimes(1);
    expect(net.fetch).toHaveBeenCalledWith(CURATED_REGISTRY_URL);
  });

  it("serves a stale same-source cache while refresh fails, without fallback", async () => {
    const rawRegistry = createRegistry();
    writeCache(rawRegistry, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
    vi.mocked(net.fetch).mockRejectedValue(new Error("curated registry unavailable"));

    await expect(getRegistry()).resolves.toMatchObject({ agents: rawRegistry.agents });
    await vi.waitFor(() => expect(net.fetch).toHaveBeenCalledOnce());
    expect(net.fetch).toHaveBeenCalledWith(CURATED_REGISTRY_URL);
  });

  it("does not fall back to the official registry when the curated source is unavailable", async () => {
    vi.mocked(net.fetch).mockRejectedValue(new Error("curated registry unavailable"));

    await expect(getRegistry()).rejects.toThrow("curated registry unavailable");
    expect(net.fetch).toHaveBeenCalledTimes(1);
    expect(net.fetch).toHaveBeenCalledWith(CURATED_REGISTRY_URL);
  });
});
