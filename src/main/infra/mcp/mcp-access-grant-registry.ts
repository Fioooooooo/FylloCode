import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  parseMcpWorkspaceDescriptor,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";
import type { BundledMcpServerName } from "./bundled-mcp-registry";

export const MCP_ACCESS_GRANT_TTL_MS = 60 * 60 * 1000;

export interface McpAccessGrant {
  readonly tokenHash: string;
  readonly activationId: string;
  readonly agentId: string;
  readonly fylloSessionId?: string;
  readonly acpSessionId?: string;
  readonly workspaceId: string;
  readonly allowedServerNames: readonly BundledMcpServerName[];
  readonly descriptor: McpWorkspaceDescriptorV2;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface IssuedMcpAccessGrant {
  token: string;
  activationId: string;
  expiresAt: string;
}

export type McpGrantAuthorization =
  | { status: "authorized"; grant: McpAccessGrant }
  | { status: "unauthorized" }
  | { status: "forbidden" };

export interface McpAccessGrantRegistryDependencies {
  now(): number;
  createToken(): string;
  createActivationId(): string;
}

const defaultDependencies: McpAccessGrantRegistryDependencies = {
  now: Date.now,
  createToken: () => randomBytes(32).toString("base64url"),
  createActivationId: randomUUID,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

function sessionKey(agentId: string, acpSessionId: string): string {
  return `${agentId}\0${acpSessionId}`;
}

export class McpAccessGrantRegistry {
  private readonly grantsByTokenHash = new Map<string, McpAccessGrant>();
  private readonly tokenHashByActivationId = new Map<string, string>();
  private readonly activationIdBySession = new Map<string, string>();

  constructor(
    private readonly dependencies: McpAccessGrantRegistryDependencies = defaultDependencies
  ) {}

  issue(input: {
    agentId: string;
    fylloSessionId?: string;
    descriptor: McpWorkspaceDescriptorV2;
    allowedServerNames: readonly BundledMcpServerName[];
    ttlMs?: number;
  }): IssuedMcpAccessGrant {
    const token = this.dependencies.createToken();
    const activationId = this.dependencies.createActivationId();
    const ttlMs = input.ttlMs ?? MCP_ACCESS_GRANT_TTL_MS;
    if (!token || !activationId || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error("Cannot issue MCP access grant with invalid token, activation, or TTL");
    }

    const tokenHash = hashToken(token);
    if (this.grantsByTokenHash.has(tokenHash) || this.tokenHashByActivationId.has(activationId)) {
      throw new Error("MCP access grant identity collision");
    }

    const issuedAtMs = this.dependencies.now();
    const expiresAtMs = issuedAtMs + ttlMs;
    const descriptor = parseMcpWorkspaceDescriptor(input.descriptor);
    const allowedServerNames = Object.freeze([...new Set(input.allowedServerNames)]);
    if (allowedServerNames.length === 0) {
      throw new Error("MCP access grant must allow at least one bundled server");
    }

    const grant: McpAccessGrant = Object.freeze({
      tokenHash,
      activationId,
      agentId: input.agentId,
      ...(input.fylloSessionId ? { fylloSessionId: input.fylloSessionId } : {}),
      workspaceId: descriptor.workspaceId,
      allowedServerNames,
      descriptor,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });

    this.grantsByTokenHash.set(tokenHash, grant);
    this.tokenHashByActivationId.set(activationId, tokenHash);
    return { token, activationId, expiresAt: grant.expiresAt };
  }

  authorize(token: string, serverName: BundledMcpServerName): McpGrantAuthorization {
    if (!token) {
      return { status: "unauthorized" };
    }
    const tokenHash = hashToken(token);
    const grant = this.grantsByTokenHash.get(tokenHash);
    if (!grant) {
      return { status: "unauthorized" };
    }
    if (Date.parse(grant.expiresAt) <= this.dependencies.now()) {
      this.revokeActivation(grant.activationId);
      return { status: "unauthorized" };
    }
    if (!grant.allowedServerNames.includes(serverName)) {
      return { status: "forbidden" };
    }
    return { status: "authorized", grant };
  }

  bindToAcpSession(activationId: string, agentId: string, acpSessionId: string): void {
    const grant = this.getActiveGrant(activationId);
    if (!grant || grant.agentId !== agentId) {
      throw new Error("Cannot bind an inactive or mismatched MCP access grant");
    }

    const key = sessionKey(agentId, acpSessionId);
    const previousActivationId = this.activationIdBySession.get(key);
    if (previousActivationId && previousActivationId !== activationId) {
      this.revokeActivation(previousActivationId);
    }

    const updated = Object.freeze({ ...grant, acpSessionId });
    this.grantsByTokenHash.set(grant.tokenHash, updated);
    this.activationIdBySession.set(key, activationId);
  }

  isActive(activationId: string): boolean {
    return this.getActiveGrant(activationId) !== null;
  }

  getActivationForAcpSession(agentId: string, acpSessionId: string): string | null {
    const activationId = this.activationIdBySession.get(sessionKey(agentId, acpSessionId));
    if (!activationId) {
      return null;
    }
    if (!this.isActive(activationId)) {
      this.activationIdBySession.delete(sessionKey(agentId, acpSessionId));
      return null;
    }
    return activationId;
  }

  revokeActivation(activationId: string): void {
    const tokenHash = this.tokenHashByActivationId.get(activationId);
    if (!tokenHash) {
      return;
    }
    const grant = this.grantsByTokenHash.get(tokenHash);
    if (grant?.acpSessionId) {
      const key = sessionKey(grant.agentId, grant.acpSessionId);
      if (this.activationIdBySession.get(key) === activationId) {
        this.activationIdBySession.delete(key);
      }
    }
    this.grantsByTokenHash.delete(tokenHash);
    this.tokenHashByActivationId.delete(activationId);
  }

  revokeAcpSession(agentId: string, acpSessionId: string): void {
    const key = sessionKey(agentId, acpSessionId);
    const activationId = this.activationIdBySession.get(key);
    this.activationIdBySession.delete(key);
    if (activationId) {
      this.revokeActivation(activationId);
    }
  }

  revokeAgent(agentId: string): void {
    for (const grant of [...this.grantsByTokenHash.values()]) {
      if (grant.agentId === agentId) {
        this.revokeActivation(grant.activationId);
      }
    }
  }

  revokeAll(): void {
    this.grantsByTokenHash.clear();
    this.tokenHashByActivationId.clear();
    this.activationIdBySession.clear();
  }

  private getActiveGrant(activationId: string): McpAccessGrant | null {
    const tokenHash = this.tokenHashByActivationId.get(activationId);
    const grant = tokenHash ? this.grantsByTokenHash.get(tokenHash) : undefined;
    if (!grant) {
      return null;
    }
    if (Date.parse(grant.expiresAt) <= this.dependencies.now()) {
      this.revokeActivation(activationId);
      return null;
    }
    return grant;
  }
}

export const mcpAccessGrantRegistry = new McpAccessGrantRegistry();
