import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-agent-catalog-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/storage/acp-registry-cache", () => ({
  getRegistry: vi.fn(),
}));

vi.mock("@main/infra/storage/custom-agent-config-store", () => ({
  readCustomAgents: vi.fn(),
}));

vi.mock("@main/infra/acp/detector", async () => {
  const actual = await vi.importActual<typeof import("@main/infra/acp/detector")>(
    "@main/infra/acp/detector"
  );
  return {
    ...actual,
    findCommandPath: vi.fn(),
  };
});

import { findCommandPath } from "@main/infra/acp/detector";
import { getRegistry } from "@main/infra/storage/acp-registry-cache";
import { readCustomAgents } from "@main/infra/storage/custom-agent-config-store";
import {
  generateCustomAgentId,
  getAgentById,
  isCustomAgentId,
  listAgents,
  resolveCustomCommandPath,
} from "@main/infra/acp/agent-catalog-service";

const mockedGetRegistry = vi.mocked(getRegistry);
const mockedReadCustomAgents = vi.mocked(readCustomAgents);
const mockedFindCommandPath = vi.mocked(findCommandPath);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

function createRegistryAgent(id: string, name: string) {
  return {
    id,
    name,
    version: "1.0.0",
    description: "",
    authors: [],
    license: "MIT",
    distribution: {},
  };
}

describe("agent-catalog-service", () => {
  describe("isCustomAgentId", () => {
    it("returns true for custom ids", () => {
      expect(isCustomAgentId("custom-foo-bar")).toBe(true);
    });

    it("returns false for registry ids", () => {
      expect(isCustomAgentId("claude-code")).toBe(false);
    });
  });

  describe("generateCustomAgentId", () => {
    it("generates stable ids for the same command and args", () => {
      const first = generateCustomAgentId("/usr/local/bin/kimi", ["acp"]);
      const second = generateCustomAgentId("/usr/local/bin/kimi", ["acp"]);
      expect(first).toBe(second);
      expect(first.startsWith("custom-")).toBe(true);
    });

    it("generates different ids for different args", () => {
      const first = generateCustomAgentId("/usr/local/bin/kimi", ["acp"]);
      const second = generateCustomAgentId("/usr/local/bin/kimi", ["server"]);
      expect(first).not.toBe(second);
    });
  });

  describe("resolveCustomCommandPath", () => {
    it("expands tilde to home directory", async () => {
      const result = await resolveCustomCommandPath("~/bin/kimi");
      expect(result).toMatch(/^\//);
      expect(result).toContain("/bin/kimi");
    });

    it("resolves relative commands via PATH", async () => {
      mockedFindCommandPath.mockResolvedValue("/usr/local/bin/kimi");
      await expect(resolveCustomCommandPath("kimi")).resolves.toBe("/usr/local/bin/kimi");
      expect(mockedFindCommandPath).toHaveBeenCalledWith("kimi");
    });

    it("keeps absolute paths unchanged", async () => {
      await expect(resolveCustomCommandPath("/opt/kimi")).resolves.toBe("/opt/kimi");
      expect(mockedFindCommandPath).not.toHaveBeenCalled();
    });
  });

  describe("listAgents", () => {
    it("returns only registry agents when no custom agents are configured", async () => {
      mockedGetRegistry.mockResolvedValue({
        agents: [createRegistryAgent("claude-code", "Claude Code")],
      });
      mockedReadCustomAgents.mockResolvedValue({ agent_servers: {} });

      const agents = await listAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        id: "claude-code",
        source: "registry",
        name: "Claude Code",
      });
    });

    it("merges registry and custom agents", async () => {
      mockedGetRegistry.mockResolvedValue({
        agents: [createRegistryAgent("claude-code", "Claude Code")],
      });
      mockedReadCustomAgents.mockResolvedValue({
        agent_servers: {
          "Kimi Code CLI": { command: "kimi", args: ["acp"] },
        },
      });
      mockedFindCommandPath.mockResolvedValue("/usr/local/bin/kimi");

      const agents = await listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0]).toMatchObject({ id: "claude-code", source: "registry" });
      expect(agents[1]).toMatchObject({
        source: "custom",
        name: "Kimi Code CLI",
      });
      expect(agents[1].id.startsWith("custom-")).toBe(true);
    });

    it("deduplicates custom agents with the same command/args", async () => {
      mockedGetRegistry.mockResolvedValue({ agents: [] });
      mockedReadCustomAgents.mockResolvedValue({
        agent_servers: {
          "Kimi A": { command: "kimi", args: ["acp"] },
          "Kimi B": { command: "kimi", args: ["acp"] },
        },
      });
      mockedFindCommandPath.mockResolvedValue("/usr/local/bin/kimi");

      const agents = await listAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("Kimi A");
    });
  });

  describe("getAgentById", () => {
    it("finds registry agent by id", async () => {
      mockedGetRegistry.mockResolvedValue({
        agents: [createRegistryAgent("claude-code", "Claude Code")],
      });

      const agent = await getAgentById("claude-code");

      expect(agent).toMatchObject({ id: "claude-code", source: "registry", name: "Claude Code" });
    });

    it("finds custom agent by id", async () => {
      mockedReadCustomAgents.mockResolvedValue({
        agent_servers: {
          "Kimi Code CLI": { command: "kimi", args: ["acp"] },
        },
      });
      mockedFindCommandPath.mockResolvedValue("/usr/local/bin/kimi");

      const id = generateCustomAgentId("/usr/local/bin/kimi", ["acp"]);
      const agent = await getAgentById(id);

      expect(agent).toMatchObject({ id, source: "custom", name: "Kimi Code CLI" });
    });

    it("returns undefined for unknown ids", async () => {
      mockedGetRegistry.mockResolvedValue({ agents: [] });
      mockedReadCustomAgents.mockResolvedValue({ agent_servers: {} });

      await expect(getAgentById("unknown")).resolves.toBeUndefined();
    });
  });
});
