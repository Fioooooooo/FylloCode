import { mkdirSync, rmSync, writeFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return {
    tempRoot: createTestTempRoot("fyllocode-detector-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import { detectAgentStatuses } from "@main/infra/acp/detector";
import type { CatalogAgent } from "@shared/types/acp-agent";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function createCustomAgent(command: string): CatalogAgent {
  return {
    id: `custom-${command.replace(/[^a-z0-9]+/g, "-")}`,
    source: "custom",
    name: "Test Custom Agent",
    customConfig: {
      displayName: "Test Custom Agent",
      command,
      args: [],
      env: {},
    },
  };
}

describe("detector custom agent branch", () => {
  it("returns installed=true when command file exists", async () => {
    const commandPath = `${tempRoot}/fake-agent`;
    mkdirSync(`${tempRoot}`, { recursive: true });
    writeFileSync(commandPath, "#!/bin/sh\necho ok", "utf8");

    const agent = createCustomAgent(commandPath);
    const statuses = await detectAgentStatuses([agent]);

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      id: agent.id,
      installed: true,
      managedBy: null,
      source: "custom",
      name: "Test Custom Agent",
    });
  });

  it("returns installed=false when command file does not exist", async () => {
    const agent = createCustomAgent("/nonexistent/fake-agent");
    const statuses = await detectAgentStatuses([agent]);

    expect(statuses[0]).toMatchObject({
      id: agent.id,
      installed: false,
      managedBy: null,
      source: "custom",
    });
  });
});
