import type {
  ClientSideConnection,
  InitializeResponse,
  SessionConfigOption,
} from "@agentclientprotocol/sdk";
import {
  isSessionMissingError,
  supportsLoad,
  supportsResume,
} from "@main/domain/session/chat/acp-session-recovery";
import { forgetActiveAcpSession, markAcpSessionActive } from "@main/infra/process/acp-process-pool";

type AgentProcessEntry = Awaited<
  ReturnType<typeof import("@main/infra/process/acp-process-pool").getOrStartProcess>
>;
type AcpMcpServers = NonNullable<Parameters<ClientSideConnection["newSession"]>[0]["mcpServers"]>;

export type AcpSessionActivationStrategy =
  "resume_session" | "load_session" | "fresh_fallback" | "new_session";

export interface AcpSessionActivationOutcome {
  sessionId: string;
  previousSessionId: string | null;
  strategy: AcpSessionActivationStrategy;
  createdNewSession: boolean;
  configOptions: SessionConfigOption[] | null | undefined;
}

export interface ActivateAcpSessionParams {
  entry: AgentProcessEntry;
  initializeResponse: InitializeResponse;
  persistedSessionId: string | null;
  cwd: string;
  additionalDirectories: string[];
  createMcpActivation(): Promise<{
    mcpServers: AcpMcpServers;
    mcpActivationId: string | null;
    revoke(): void;
  }>;
  allowFreshSession: boolean;
  onLoadStart?: (sessionId: string) => void;
  onLoadFinish?: (sessionId: string) => void;
  onNewSessionCreated?: (sessionId: string) => void;
  checkCancelled?: (stage: string) => void;
}

export async function activateAcpSession({
  entry,
  initializeResponse,
  persistedSessionId,
  cwd,
  additionalDirectories,
  createMcpActivation,
  allowFreshSession,
  onLoadStart,
  onLoadFinish,
  onNewSessionCreated,
  checkCancelled,
}: ActivateAcpSessionParams): Promise<AcpSessionActivationOutcome> {
  const { connection } = entry;
  let lastMissingError: unknown;

  if (persistedSessionId && supportsResume(initializeResponse)) {
    checkCancelled?.("before resumeSession");
    const mcpActivation = await createMcpActivation();
    let bound = false;
    try {
      const response = await connection.resumeSession({
        sessionId: persistedSessionId,
        cwd,
        additionalDirectories,
        mcpServers: mcpActivation.mcpServers,
      });
      checkCancelled?.("after resumeSession");
      markAcpSessionActive(entry, persistedSessionId, mcpActivation.mcpActivationId);
      bound = true;
      return {
        sessionId: persistedSessionId,
        previousSessionId: persistedSessionId,
        strategy: "resume_session",
        createdNewSession: false,
        configOptions: response.configOptions,
      };
    } catch (error: unknown) {
      checkCancelled?.("after failed resumeSession");
      if (!isSessionMissingError(error)) {
        throw error;
      }
      lastMissingError = error;
    } finally {
      if (!bound) {
        mcpActivation.revoke();
      }
    }
  }

  if (persistedSessionId && supportsLoad(initializeResponse)) {
    checkCancelled?.("before loadSession");
    onLoadStart?.(persistedSessionId);
    let mcpActivation: Awaited<ReturnType<typeof createMcpActivation>> | null = null;
    let bound = false;
    try {
      mcpActivation = await createMcpActivation();
      const response = await connection.loadSession({
        sessionId: persistedSessionId,
        cwd,
        additionalDirectories,
        mcpServers: mcpActivation.mcpServers,
      });
      checkCancelled?.("after loadSession");
      markAcpSessionActive(entry, persistedSessionId, mcpActivation.mcpActivationId);
      bound = true;
      return {
        sessionId: persistedSessionId,
        previousSessionId: persistedSessionId,
        strategy: "load_session",
        createdNewSession: false,
        configOptions: response.configOptions,
      };
    } catch (error: unknown) {
      checkCancelled?.("after failed loadSession");
      if (!isSessionMissingError(error)) {
        throw error;
      }
      lastMissingError = error;
    } finally {
      if (!bound) {
        mcpActivation?.revoke();
      }
      onLoadFinish?.(persistedSessionId);
    }
  }

  if (!allowFreshSession) {
    if (lastMissingError) {
      throw lastMissingError;
    }
    throw new Error(
      `ACP session ${persistedSessionId ?? "<missing>"} cannot be activated without a fresh session`
    );
  }

  checkCancelled?.("before newSession");
  const mcpActivation = await createMcpActivation();
  let bound = false;
  try {
    const created = await connection.newSession({
      cwd,
      additionalDirectories,
      mcpServers: mcpActivation.mcpServers,
    });
    onNewSessionCreated?.(created.sessionId);
    checkCancelled?.("after newSession");
    if (persistedSessionId && persistedSessionId !== created.sessionId) {
      forgetActiveAcpSession(entry, persistedSessionId);
    }
    markAcpSessionActive(entry, created.sessionId, mcpActivation.mcpActivationId);
    bound = true;
    return {
      sessionId: created.sessionId,
      previousSessionId: persistedSessionId,
      strategy: persistedSessionId ? "fresh_fallback" : "new_session",
      createdNewSession: true,
      configOptions: created.configOptions,
    };
  } finally {
    if (!bound) {
      mcpActivation.revoke();
    }
  }
}
