import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCP_ACCESS_GRANT_DEFAULT_EXPIRES_AT,
  McpAccessGrantRegistry,
  type McpAccessGrantRegistryDependencies,
} from "@main/infra/mcp/mcp-access-grant-registry";
import { parseMcpWorkspaceDescriptor } from "@shared/types/mcp-workspace";

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@main/infra/logger", () => ({
  default: loggerMocks,
}));

function descriptor(workspaceId = "workspace-1") {
  const folderPath = resolve(`/work/${workspaceId}`);
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId,
    workspaceKind: "folder",
    primaryFolderId: `folder-${workspaceId}`,
    folders: [
      {
        folderId: `folder-${workspaceId}`,
        folderName: workspaceId,
        folderPath,
      },
    ],
    workspaceDataDir: resolve(`/data/${workspaceId}`),
  });
}

function setup() {
  let now = Date.parse("2026-08-02T00:00:00.000Z");
  let sequence = 0;
  const dependencies: McpAccessGrantRegistryDependencies = {
    now: () => now,
    createToken: () => `token-${++sequence}`,
    createActivationId: () => `activation-${sequence}`,
  };
  return {
    registry: new McpAccessGrantRegistry(dependencies),
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("MCP access grant registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues distinct opaque tokens while authorization exposes only their hashes", () => {
    const { registry } = setup();
    const first = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
    const second = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });

    expect(first.token).not.toBe(second.token);
    const authorization = registry.authorize(first.token, "fyllo-specs");
    expect(authorization.status).toBe("authorized");
    if (authorization.status === "authorized") {
      expect(authorization.grant.tokenHash).not.toBe(first.token);
      expect(authorization.grant.workspaceId).toBe("workspace-1");
      expect(Object.isFrozen(authorization.grant.descriptor)).toBe(true);
    }
    const logs = Object.values(loggerMocks)
      .flatMap((mock) => mock.mock.calls.flat())
      .join("\n");
    expect(logs).toContain(`issued activationId=${first.activationId}`);
    expect(logs).not.toContain(first.token);
    expect(logs).not.toContain(second.token);
  });

  it("distinguishes invalid tokens from a server outside the grant allowlist", () => {
    const { registry } = setup();
    const issued = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });

    expect(registry.authorize("missing", "fyllo-specs")).toEqual({
      status: "unauthorized",
      reason: "grant-not-found",
    });
    expect(registry.authorize(issued.token, "fyllo-cortex")).toEqual({ status: "forbidden" });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "[mcp-access-grant] authorization rejected server=fyllo-specs reason=grant-not-found"
    );
  });

  it("keeps production-default grants active beyond the former one-hour TTL", () => {
    const { registry, advance } = setup();
    const issued = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });

    expect(issued.expiresAt).toBe(MCP_ACCESS_GRANT_DEFAULT_EXPIRES_AT);
    advance(60 * 60 * 1000);

    expect(registry.authorize(issued.token, "fyllo-specs").status).toBe("authorized");
    expect(registry.isActive(issued.activationId)).toBe(true);
  });

  it("expires grants lazily and removes their Session binding", () => {
    const { registry, advance } = setup();
    const issued = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
      ttlMs: 1_000,
    });
    registry.bindToAcpSession(issued.activationId, "agent-1", "acp-1");

    advance(1_000);

    expect(registry.isActive(issued.activationId)).toBe(false);
    expect(registry.getActivationForAcpSession("agent-1", "acp-1")).toBeNull();
    expect(registry.authorize(issued.token, "fyllo-specs")).toEqual({
      status: "unauthorized",
      reason: "grant-not-found",
    });
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(`revoked activationId=${issued.activationId}`)
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining("reason=expired"));
  });

  it("replaces an ACP Session lease and revokes the previous activation", () => {
    const { registry } = setup();
    const first = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
    const second = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
    registry.bindToAcpSession(first.activationId, "agent-1", "acp-1");
    registry.bindToAcpSession(second.activationId, "agent-1", "acp-1");

    expect(registry.isActive(first.activationId)).toBe(false);
    expect(registry.getActivationForAcpSession("agent-1", "acp-1")).toBe(second.activationId);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        `bound activationId=${second.activationId} previousActivationId=${first.activationId}`
      )
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(`revoked activationId=${first.activationId}`)
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining("reason=session-activation-replaced")
    );
  });

  it("revokes by activation, Session, Agent, and all without failing on repeats", () => {
    const { registry } = setup();
    const first = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
    const second = registry.issue({
      agentId: "agent-2",
      descriptor: descriptor("workspace-2"),
      allowedServerNames: ["fyllo-cortex"],
    });
    registry.bindToAcpSession(first.activationId, "agent-1", "acp-1");
    registry.bindToAcpSession(second.activationId, "agent-2", "acp-2");

    registry.revokeAcpSession("agent-1", "acp-1");
    registry.revokeAcpSession("agent-1", "acp-1");
    expect(registry.isActive(first.activationId)).toBe(false);
    expect(registry.isActive(second.activationId)).toBe(true);

    registry.revokeAgent("agent-2");
    expect(registry.isActive(second.activationId)).toBe(false);
    registry.revokeActivation(second.activationId);
    registry.revokeAll();
    registry.revokeAll();
  });

  it("rejects empty allowlists and mismatched Agent bindings", () => {
    const { registry } = setup();
    expect(() =>
      registry.issue({ agentId: "agent-1", descriptor: descriptor(), allowedServerNames: [] })
    ).toThrow(/at least one bundled server/);

    const issued = registry.issue({
      agentId: "agent-1",
      descriptor: descriptor(),
      allowedServerNames: ["fyllo-specs"],
    });
    expect(() => registry.bindToAcpSession(issued.activationId, "agent-2", "acp-1")).toThrow(
      /inactive or mismatched/
    );
  });
});
