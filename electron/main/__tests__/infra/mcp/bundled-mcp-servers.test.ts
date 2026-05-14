import { join } from "path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { is } from "@electron-toolkit/utils";
import { getBundledMcpServers, toAcpMcpServerEnv } from "@main/infra/mcp/bundled-mcp-servers";

describe("bundled mcp servers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
    (is as { dev: boolean }).dev = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns dev bundle spec", () => {
    const specs = getBundledMcpServers({ projectPath: "/tmp/project" });
    expect(specs[0]?.name).toBe("fyllo-specs");
    expect(specs[0]?.command).toBe(process.execPath);
    expect(specs[0]?.env.FYLLO_PROJECT_PATH).toBe("/tmp/project");
    expect(specs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
      join(process.cwd(), "node_modules", "@fission-ai", "openspec", "bin", "openspec.js")
    );
  });

  it("returns production openspec cli path from app.asar", () => {
    (is as { dev: boolean }).dev = false;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/FylloCode.app/Contents/Resources",
    });

    const specs = getBundledMcpServers({ projectPath: "/tmp/project" });

    expect(specs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
      join(
        "/Applications/FylloCode.app/Contents/Resources",
        "app.asar",
        "node_modules",
        "@fission-ai",
        "openspec",
        "bin",
        "openspec.js"
      )
    );
  });

  it("respects disable flag", () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    expect(getBundledMcpServers({ projectPath: "/tmp/project" })).toEqual([]);
  });

  it("converts env record to acp env list", () => {
    expect(toAcpMcpServerEnv({ A: "1", B: "2" })).toEqual(
      expect.arrayContaining([
        { name: "A", value: "1" },
        { name: "B", value: "2" },
      ])
    );
  });
});
