import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { is } from "@electron-toolkit/utils";
import { createBundledMcpActivation, toAcpMcpServer } from "@main/infra/mcp/bundled-mcp-servers";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";

const hostMocks = vi.hoisted(() => ({
  waitForBundledMcpInitialReadiness: vi.fn<() => Promise<void>>(),
  getMcpServerEndpoint: vi.fn(),
}));

const grantMocks = vi.hoisted(() => ({
  issue: vi.fn(() => ({
    token: "activation-token",
    activationId: "activation-1",
    expiresAt: "2026-08-02T01:00:00.000Z",
  })),
}));

vi.mock("@main/infra/mcp/bundled-mcp-host", () => hostMocks);
vi.mock("@main/infra/mcp/mcp-access-grant-registry", () => ({
  mcpAccessGrantRegistry: grantMocks,
}));

function descriptor() {
  const folderPath = resolve("/tmp/project");
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId: "workspace-1",
    workspaceKind: "folder",
    primaryFolderId: "folder-1",
    folders: [{ folderId: "folder-1", folderName: "Project", folderPath }],
    workspaceDataDir: resolve("/tmp/workspace-data"),
    mcpEventDir: resolve("/tmp/workspace-data/mcp-events"),
    sessionId: "session-1",
  });
}

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

  it("returns dev stdio fallback specs with only Workspace v2 context", async () => {
    const activation = await createBundledMcpActivation({
      agentId: "agent-1",
      descriptor: descriptor(),
      supportsHttp: false,
    });
    const stdioSpecs = activation.servers.filter((spec) => spec.type === "stdio");

    expect(activation.activationId).toBeNull();
    expect(stdioSpecs.map((spec) => spec.name)).toEqual(["fyllo-specs", "fyllo-cortex"]);
    expect(stdioSpecs[0]?.command).toBe(process.execPath);
    expect(stdioSpecs[0]?.args[0]).toBe(
      join(process.cwd(), "out", "mcp-servers", "fyllo-specs", "index.js")
    );
    expect(JSON.parse(stdioSpecs[0]!.env.FYLLO_WORKSPACE_JSON)).toEqual(descriptor());
    expect(stdioSpecs[0]?.env).not.toHaveProperty("FYLLO_PROJECT_PATH");
    expect(stdioSpecs[0]?.env).not.toHaveProperty("FYLLO_PROJECT_DATA_DIR");
    expect(stdioSpecs[0]?.env).not.toHaveProperty("FYLLO_MCP_EVENT_DIR");
    expect(stdioSpecs[0]?.env).not.toHaveProperty("FYLLO_SESSION_ID");
    expect(stdioSpecs[0]?.env.FYLLO_OPENSPEC_CLI_PATH).toBe(
      join(process.cwd(), "node_modules", "@fission-ai", "openspec", "bin", "openspec.js")
    );
    expect(grantMocks.issue).not.toHaveBeenCalled();
    expect(hostMocks.waitForBundledMcpInitialReadiness).toHaveBeenCalledOnce();
  });

  it("returns production stdio bundle specs from unpacked resources", async () => {
    (is as { dev: boolean }).dev = false;
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/FylloCode.app/Contents/Resources",
    });

    const activation = await createBundledMcpActivation({
      agentId: "agent-1",
      descriptor: descriptor(),
      supportsHttp: false,
    });
    const stdioSpecs = activation.servers.filter((spec) => spec.type === "stdio");

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

  it("builds mixed specs with one activation token scoped to ready HTTP servers", async () => {
    hostMocks.getMcpServerEndpoint.mockImplementation((name: string) =>
      name === "fyllo-specs" ? { url: "http://127.0.0.1:50100/mcp/fyllo-specs" } : null
    );

    const activation = await createBundledMcpActivation({
      agentId: "agent-1",
      descriptor: descriptor(),
      supportsHttp: true,
    });

    expect(activation.activationId).toBe("activation-1");
    expect(activation.servers[0]).toEqual({
      type: "http",
      name: "fyllo-specs",
      url: "http://127.0.0.1:50100/mcp/fyllo-specs",
      headers: { Authorization: "Bearer activation-token" },
    });
    expect(activation.servers[1]).toEqual(
      expect.objectContaining({
        type: "stdio",
        name: "fyllo-cortex",
        env: expect.objectContaining({ FYLLO_WORKSPACE_JSON: JSON.stringify(descriptor()) }),
      })
    );
    expect(grantMocks.issue).toHaveBeenCalledWith({
      agentId: "agent-1",
      fylloSessionId: "session-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
  });

  it("does not query endpoints or issue a grant without HTTP capability", async () => {
    hostMocks.getMcpServerEndpoint.mockReturnValue({
      url: "http://127.0.0.1:50100/mcp/fyllo-specs",
    });

    const activation = await createBundledMcpActivation({
      agentId: "agent-1",
      descriptor: descriptor(),
      supportsHttp: false,
    });

    expect(activation.servers.map((spec) => spec.name)).toEqual(["fyllo-specs", "fyllo-cortex"]);
    expect(activation.servers.every((spec) => spec.type === "stdio")).toBe(true);
    expect(activation.activationId).toBeNull();
    expect(hostMocks.getMcpServerEndpoint).not.toHaveBeenCalled();
    expect(grantMocks.issue).not.toHaveBeenCalled();
  });

  it("injects an HTTP-only server only when its backend is ready", async () => {
    hostMocks.getMcpServerEndpoint.mockImplementation((name: string) =>
      name === "fyllo-spawn" ? { url: "http://127.0.0.1:50100/mcp/fyllo-spawn" } : null
    );

    const activation = await createBundledMcpActivation({
      agentId: "agent-1",
      descriptor: descriptor(),
      supportsHttp: true,
    });

    expect(activation.servers.map((spec) => [spec.name, spec.type])).toEqual([
      ["fyllo-specs", "stdio"],
      ["fyllo-cortex", "stdio"],
      ["fyllo-spawn", "http"],
    ]);
    expect(grantMocks.issue).toHaveBeenCalledWith(
      expect.objectContaining({ allowedServerNames: ["fyllo-spawn"] })
    );
  });

  it("respects the complete disable flag without waiting for host", async () => {
    process.env.FYLLO_DISABLE_BUNDLED_MCP = "1";
    await expect(
      createBundledMcpActivation({
        agentId: "agent-1",
        descriptor: descriptor(),
        supportsHttp: true,
      })
    ).resolves.toEqual({ servers: [], activationId: null });
    expect(hostMocks.waitForBundledMcpInitialReadiness).not.toHaveBeenCalled();
    expect(grantMocks.issue).not.toHaveBeenCalled();
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
