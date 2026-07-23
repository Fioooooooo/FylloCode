import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { is } from "@electron-toolkit/utils";
import {
  encodeMcpHeaderValue,
  resolveBundledMcpServers,
  toAcpMcpServer,
} from "@main/infra/mcp/bundled-mcp-servers";
import { mcpEventsDir, projectDir } from "@main/infra/storage/project-paths";

const hostMocks = vi.hoisted(() => ({
  waitForBundledMcpInitialReadiness: vi.fn<() => Promise<void>>(),
  getMcpServerEndpoint: vi.fn(),
}));

vi.mock("@main/infra/mcp/bundled-mcp-host", () => hostMocks);

describe("bundled mcp servers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    hostMocks.waitForBundledMcpInitialReadiness.mockResolvedValue();
    hostMocks.getMcpServerEndpoint.mockReturnValue(null);
    delete process.env.FYLLO_DISABLE_BUNDLED_MCP;
    (is as { dev: boolean }).dev = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns dev stdio fallback specs in stable order", async () => {
    const specs = await resolveBundledMcpServers({
      projectPath: "/tmp/project",
      supportsHttp: false,
    });
    const stdioSpecs = specs.filter((spec) => spec.type === "stdio");

    expect(stdioSpecs.map((spec) => spec.name)).toEqual(["fyllo-specs", "fyllo-cortex"]);
    expect(stdioSpecs[0]?.command).toBe(process.execPath);
    expect(stdioSpecs[0]?.args[0]).toBe(
      join(process.cwd(), "out", "mcp-servers", "fyllo-specs", "index.js")
    );
    expect(stdioSpecs[1]?.args[0]).toBe(
      join(process.cwd(), "out", "mcp-servers", "fyllo-cortex", "index.js")
    );
    expect(stdioSpecs[0]?.env).toEqual(
      expect.objectContaining({
        ELECTRON_RUN_AS_NODE: "1",
        FYLLO_PROJECT_PATH: "/tmp/project",
        FYLLO_PROJECT_DATA_DIR: projectDir("/tmp/project"),
        FYLLO_MCP_TELEMETRY: "0",
        FYLLO_MCP_EVENT_DIR: mcpEventsDir("/tmp/project"),
      })
    );
    expect(stdioSpecs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
      join(process.cwd(), "node_modules", "@fission-ai", "openspec", "bin", "openspec.js")
    );
    expect(stdioSpecs[1]?.env.FYLLO_OPENSPEC_CLI_PATH).toBeUndefined();
    expect(hostMocks.waitForBundledMcpInitialReadiness).toHaveBeenCalledOnce();
  });

  it("returns production stdio bundle specs from unpacked resources", async () => {
    (is as { dev: boolean }).dev = false;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/FylloCode.app/Contents/Resources",
    });

    const specs = await resolveBundledMcpServers({
      projectPath: "/tmp/project",
      supportsHttp: false,
    });
    const stdioSpecs = specs.filter((spec) => spec.type === "stdio");

    expect(stdioSpecs[0]?.args[0]).toBe(
      join(
        "/Applications/FylloCode.app/Contents/Resources",
        "app.asar.unpacked",
        "mcp-servers",
        "fyllo-specs",
        "index.js"
      )
    );
    expect(stdioSpecs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
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

  it("builds mixed HTTP and stdio specs per backend readiness", async () => {
    hostMocks.getMcpServerEndpoint.mockImplementation((name: string) =>
      name === "fyllo-specs"
        ? { url: "http://127.0.0.1:50100/mcp/fyllo-specs", token: "shared-token" }
        : null
    );

    const specs = await resolveBundledMcpServers({
      projectPath: "/tmp/中文 project",
      fylloSessionId: "session-1",
      supportsHttp: true,
    });

    expect(specs[0]).toEqual({
      type: "http",
      name: "fyllo-specs",
      url: "http://127.0.0.1:50100/mcp/fyllo-specs",
      headers: expect.objectContaining({
        Authorization: "Bearer shared-token",
        "X-Fyllo-Project-Path": encodeMcpHeaderValue("/tmp/中文 project"),
        "X-Fyllo-Session-Id": encodeMcpHeaderValue("session-1"),
      }),
    });
    expect(specs[1]).toEqual(
      expect.objectContaining({
        type: "stdio",
        name: "fyllo-cortex",
        env: expect.objectContaining({ FYLLO_SESSION_ID: "session-1" }),
      })
    );
  });

  it("does not use HTTP endpoints when the agent lacks capability", async () => {
    hostMocks.getMcpServerEndpoint.mockReturnValue({
      url: "http://127.0.0.1:50100/mcp/fyllo-specs",
      token: "shared-token",
    });

    const specs = await resolveBundledMcpServers({
      projectPath: "/tmp/project",
      supportsHttp: false,
    });

    expect(specs.every((spec) => spec.type === "stdio")).toBe(true);
    expect(hostMocks.getMcpServerEndpoint).not.toHaveBeenCalled();
  });

  it("respects the complete disable flag without waiting for host", async () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    await expect(
      resolveBundledMcpServers({ projectPath: "/tmp/project", supportsHttp: true })
    ).resolves.toEqual([]);
    expect(hostMocks.waitForBundledMcpInitialReadiness).not.toHaveBeenCalled();
  });

  it("converts internal specs to ACP wire types", () => {
    expect(
      toAcpMcpServer({
        type: "stdio",
        name: "stdio",
        command: "node",
        args: ["server.js"],
        env: { A: "1" },
      })
    ).toEqual({
      name: "stdio",
      command: "node",
      args: ["server.js"],
      env: [{ name: "A", value: "1" }],
    });
    expect(
      toAcpMcpServer({
        type: "http",
        name: "http",
        url: "http://127.0.0.1:5000/mcp/http",
        headers: { Authorization: "Bearer token" },
      })
    ).toEqual({
      type: "http",
      name: "http",
      url: "http://127.0.0.1:5000/mcp/http",
      headers: [{ name: "Authorization", value: "Bearer token" }],
    });
  });
});
