import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  parseMcpWorkspaceDescriptor,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";
import logger from "@main/infra/logger";
import type { BundledMcpServerName } from "./bundled-mcp-registry";

export const MCP_ACCESS_GRANT_DEFAULT_EXPIRES_AT = "2099-12-31T23:59:59.999Z";

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
  | { status: "unauthorized"; reason: "missing-token" | "grant-not-found" | "expired" }
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
    const ttlMs = input.ttlMs;
    if (
      !token ||
      !activationId ||
      (ttlMs !== undefined && (!Number.isSafeInteger(ttlMs) || ttlMs <= 0))
    ) {
      throw new Error("Cannot issue MCP access grant with invalid token, activation, or TTL");
    }

    const tokenHash = hashToken(token);
    if (this.grantsByTokenHash.has(tokenHash) || this.tokenHashByActivationId.has(activationId)) {
      throw new Error("MCP access grant identity collision");
    }

    const issuedAtMs = this.dependencies.now();
    const expiresAt =
      ttlMs === undefined
        ? MCP_ACCESS_GRANT_DEFAULT_EXPIRES_AT
        : new Date(issuedAtMs + ttlMs).toISOString();
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
      expiresAt,
    });

    this.grantsByTokenHash.set(tokenHash, grant);
    this.tokenHashByActivationId.set(activationId, tokenHash);
    logger.info(
      `[mcp-access-grant] issued activationId=${activationId} agentId=${input.agentId} fylloSessionId=${input.fylloSessionId ?? "none"} workspaceId=${descriptor.workspaceId} servers=${allowedServerNames.join(",")} expiresAt=${grant.expiresAt}`
    );
    return { token, activationId, expiresAt: grant.expiresAt };
  }

  authorize(token: string, serverName: BundledMcpServerName): McpGrantAuthorization {
    if (!token) {
      logger.warn(
        `[mcp-access-grant] authorization rejected server=${serverName} reason=missing-token`
      );
      return { status: "unauthorized", reason: "missing-token" };
    }
    const tokenHash = hashToken(token);
    const grant = this.grantsByTokenHash.get(tokenHash);
    if (!grant) {
      logger.warn(
        `[mcp-access-grant] authorization rejected server=${serverName} reason=grant-not-found`
      );
      return { status: "unauthorized", reason: "grant-not-found" };
    }
    if (Date.parse(grant.expiresAt) <= this.dependencies.now()) {
      logger.warn(
        `[mcp-access-grant] authorization rejected activationId=${grant.activationId} agentId=${grant.agentId} acpSessionId=${grant.acpSessionId ?? "none"} server=${serverName} reason=expired expiresAt=${grant.expiresAt}`
      );
      this.revokeActivation(grant.activationId, "expired");
      return { status: "unauthorized", reason: "expired" };
    }
    if (!grant.allowedServerNames.includes(serverName)) {
      logger.warn(
        `[mcp-access-grant] authorization rejected activationId=${grant.activationId} agentId=${grant.agentId} acpSessionId=${grant.acpSessionId ?? "none"} server=${serverName} reason=server-forbidden`
      );
      return { status: "forbidden" };
    }
    logger.debug(
      `[mcp-access-grant] authorization accepted activationId=${grant.activationId} agentId=${grant.agentId} acpSessionId=${grant.acpSessionId ?? "none"} server=${serverName}`
    );
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
      this.revokeActivation(previousActivationId, "session-activation-replaced");
    }

    const updated = Object.freeze({ ...grant, acpSessionId });
    this.grantsByTokenHash.set(grant.tokenHash, updated);
    this.activationIdBySession.set(key, activationId);
    logger.info(
      `[mcp-access-grant] bound activationId=${activationId} previousActivationId=${previousActivationId ?? "none"} agentId=${agentId} acpSessionId=${acpSessionId} workspaceId=${grant.workspaceId}`
    );
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

  revokeActivation(activationId: string, reason = "explicit"): void {
    const tokenHash = this.tokenHashByActivationId.get(activationId);
    if (!tokenHash) {
      logger.debug(
        `[mcp-access-grant] revoke skipped activationId=${activationId} reason=${reason} state=not-found`
      );
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
    logger.info(
      `[mcp-access-grant] revoked activationId=${activationId} agentId=${grant?.agentId ?? "unknown"} acpSessionId=${grant?.acpSessionId ?? "none"} workspaceId=${grant?.workspaceId ?? "unknown"} reason=${reason}`
    );
  }

  revokeAcpSession(agentId: string, acpSessionId: string, reason = "acp-session-revoked"): void {
    const key = sessionKey(agentId, acpSessionId);
    const activationId = this.activationIdBySession.get(key);
    this.activationIdBySession.delete(key);
    if (activationId) {
      this.revokeActivation(activationId, reason);
      return;
    }
    logger.debug(
      `[mcp-access-grant] Session revoke skipped agentId=${agentId} acpSessionId=${acpSessionId} reason=${reason} state=not-found`
    );
  }

  revokeAgent(agentId: string): void {
    for (const grant of [...this.grantsByTokenHash.values()]) {
      if (grant.agentId === agentId) {
        this.revokeActivation(grant.activationId, "agent-revoked");
      }
    }
  }

  revokeAll(reason = "all-revoked"): void {
    for (const activationId of [...this.tokenHashByActivationId.keys()]) {
      this.revokeActivation(activationId, reason);
    }
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
      this.revokeActivation(activationId, "expired");
      return null;
    }
    return grant;
  }
}

export const mcpAccessGrantRegistry = new McpAccessGrantRegistry();
