import { describe, expect, it } from "vitest";
import { buildSpawnSpecForTesting } from "@main/infra/process/acp-process-pool";
import type { CatalogAgent } from "@shared/types/acp-agent";

function createCustomAgent(
  command: string,
  args: string[],
  env?: Record<string, string>,
  id = "custom-test-agent"
): CatalogAgent {
  return {
    id,
    source: "custom",
    name: "Test Agent",
    customConfig: {
      displayName: "Test Agent",
      command,
      args,
      env: env ?? {},
    },
  };
}

describe("acp-process-pool custom spawn spec", () => {
  it("uses custom command and args", () => {
    const agent = createCustomAgent("/usr/local/bin/kimi", ["acp"]);
    const spec = buildSpawnSpecForTesting(agent);

    expect(spec.cmd).toBe("/usr/local/bin/kimi");
    expect(spec.args).toEqual(["acp"]);
  });

  it("merges custom env over process.env", () => {
    const originalFoo = process.env.FOO;
    process.env.FOO = "system";

    try {
      const agent = createCustomAgent("/usr/local/bin/kimi", [], { FOO: "custom" });
      const spec = buildSpawnSpecForTesting(agent);

      expect(spec.env.FOO).toBe("custom");
    } finally {
      process.env.FOO = originalFoo;
    }
  });

  it("defaults args to empty array", () => {
    const agent = createCustomAgent("/usr/local/bin/kimi", []);
    const spec = buildSpawnSpecForTesting(agent);

    expect(spec.args).toEqual([]);
  });

  it("forces blocking MCP connection startup for claude-acp", () => {
    const agent = createCustomAgent(
      "/usr/local/bin/claude-acp",
      [],
      { MCP_CONNECTION_NONBLOCKING: "1" },
      "claude-acp"
    );
    const spec = buildSpawnSpecForTesting(agent);

    expect(spec.env.MCP_CONNECTION_NONBLOCKING).toBe("0");
  });
});
