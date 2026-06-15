import { join } from "path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { is } from "@electron-toolkit/utils";
import { getBundledMcpServers, toAcpMcpServerEnv } from "@main/infra/mcp/bundled-mcp-servers";
import { mcpEventsDir } from "@main/infra/storage/project-paths";

describe("bundled mcp servers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
    (is as { dev: boolean }).dev = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns dev bundle specs in stable order", () => {
    const specs = getBundledMcpServers({ projectPath: "/tmp/project" });
    expect(specs.map((spec) => spec.name)).toEqual(["fyllo-specs", "fyllo-cortex"]);
    expect(specs[0]?.command).toBe(process.execPath);
    expect(specs[0]?.args[0]).toBe(
      join(process.cwd(), "out", "mcp-servers", "fyllo-specs", "index.js")
    );
    expect(specs[1]?.args[0]).toBe(
      join(process.cwd(), "out", "mcp-servers", "fyllo-cortex", "index.js")
    );
    expect(specs[0]?.env).toEqual(
      expect.objectContaining({
        ELECTRON_RUN_AS_NODE: "1",
        FYLLO_PROJECT_PATH: "/tmp/project",
        FYLLO_MCP_TELEMETRY: "0",
        FYLLO_MCP_EVENT_DIR: mcpEventsDir("/tmp/project"),
      })
    );
    expect(specs[1]?.env).toEqual(
      expect.objectContaining({
        ELECTRON_RUN_AS_NODE: "1",
        FYLLO_PROJECT_PATH: "/tmp/project",
        FYLLO_MCP_TELEMETRY: "0",
        FYLLO_MCP_EVENT_DIR: mcpEventsDir("/tmp/project"),
      })
    );
    expect(specs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
      join(process.cwd(), "node_modules", "@fission-ai", "openspec", "bin", "openspec.js")
    );
    expect(specs[1]?.env.FYLLO_OPENSPEC_CLI_PATH).toBeUndefined();
  });

  it("returns production bundle specs from unpacked resources", () => {
    (is as { dev: boolean }).dev = false;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/FylloCode.app/Contents/Resources",
    });

    const specs = getBundledMcpServers({ projectPath: "/tmp/project" });

    expect(specs.map((spec) => spec.name)).toEqual(["fyllo-specs", "fyllo-cortex"]);
    expect(specs[0]?.args[0]).toBe(
      join(
        "/Applications/FylloCode.app/Contents/Resources",
        "app.asar.unpacked",
        "mcp-servers",
        "fyllo-specs",
        "index.js"
      )
    );
    expect(specs[1]?.args[0]).toBe(
      join(
        "/Applications/FylloCode.app/Contents/Resources",
        "app.asar.unpacked",
        "mcp-servers",
        "fyllo-cortex",
        "index.js"
      )
    );
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
    expect(specs[1]?.env.FYLLO_OPENSPEC_CLI_PATH).toBeUndefined();
  });

  it("respects disable flag", () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    expect(getBundledMcpServers({ projectPath: "/tmp/project" })).toEqual([]);
  });

  it("injects FYLLO_SESSION_ID when fylloSessionId is provided", () => {
    const specs = getBundledMcpServers({
      projectPath: "/tmp/project",
      fylloSessionId: "session-1",
    });

    expect(specs.every((spec) => spec.env.FYLLO_SESSION_ID === "session-1")).toBe(true);
  });

  it("does not inject FYLLO_SESSION_ID when fylloSessionId is omitted", () => {
    const specs = getBundledMcpServers({ projectPath: "/tmp/project" });

    expect(specs.every((spec) => spec.env.FYLLO_SESSION_ID === undefined)).toBe(true);
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
