import { EventEmitter } from "events";
import type {
  ClientSideConnection,
  InitializeResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { AcpSessionStore } from "@main/domain/chat/acp-session-store";
import { mapSessionUpdate } from "./acp-mapper";
import { getOrStartProcess } from "@main/infra/process/acp-process-pool";
import type { SessionEvent } from "@main/domain/chat/session-events";
import {
  buildHistoryReminder,
  createSessionRuntimeState,
  defaultRecoveryContext,
  isSessionMissingError,
  promptErrorMessage,
  shouldSuppressDuringReplay,
  supportsLoad,
  supportsResume,
} from "@main/domain/chat/acp-session-recovery";
import type {
  RecoveryContext,
  RecoveryOutcome,
  SessionRuntimeState,
} from "@main/domain/chat/acp-session-recovery";
import logger from "@main/infra/logger";
import { getBundledMcpServers, toAcpMcpServerEnv } from "@main/infra/mcp/bundled-mcp-servers";
import type { SessionOwner } from "@main/services/chat/session-registry";
import type { TextUIPart } from "ai";
import { resolveSystemReminder } from "@main/services/chat/system-reminder";

interface ReminderContext {
  changeId?: string;
  stageIndex?: number;
  runId?: string;
  worktreePath?: string;
}

type PromptPart = { type: "text"; text: string };
type AcpMcpServers = NonNullable<Parameters<ClientSideConnection["newSession"]>[0]["mcpServers"]>;

interface StartContext {
  entry: Awaited<ReturnType<typeof getOrStartProcess>>;
  mcpServers: AcpMcpServers;
  runtimeState: SessionRuntimeState;
  persistedSessionId: string | null;
}

export interface AcpSessionOpts {
  fylloSessionId: string;
  agentId: string;
  projectPath: string;
  cwd: string;
  owner: SessionOwner;
  sessionStore: AcpSessionStore;
  reminderContext?: ReminderContext;
  onReminderInjected?: (reminderPart: TextUIPart) => Promise<void>;
  recoveryContext?: Partial<RecoveryContext>;
}

export class AcpSession extends EventEmitter {
  private acpSessionId: string | null = null;
  private cancelled = false;
  private readonly recoveryContext: RecoveryContext;

  constructor(private readonly opts: AcpSessionOpts) {
    super();
    this.recoveryContext = {
      ...defaultRecoveryContext(),
      ...(opts.recoveryContext ?? {}),
    };
  }

  async start(prompt: string): Promise<void> {
    const context = await this.prepareStartContext();
    if (!context) {
      return;
    }

    try {
      await this.runStartFlow(context, prompt);
    } catch (err: unknown) {
      this.handleStartError(err);
    } finally {
      this.cleanupSessionHandler(context.entry);
    }
  }

  cancel(): void {
    this.cancelled = true;
    const { agentId } = this.opts;
    const acpSessionId = this.acpSessionId;
    if (!acpSessionId) return;

    getOrStartProcess(agentId)
      .then(({ connection }) => connection.cancel({ sessionId: acpSessionId }))
      .catch(() => {});
  }

  private async prepareStartContext(): Promise<StartContext | null> {
    const entry = await this.getProcessEntry();
    if (!entry) {
      return null;
    }

    const mcpServers: AcpMcpServers = getBundledMcpServers({
      projectPath: this.opts.projectPath,
    }).map((spec) => ({
      ...spec,
      env: toAcpMcpServerEnv(spec.env),
    }));
    const persistedSessionId = await this.opts.sessionStore.loadAcpSessionId();
    const runtimeState = createSessionRuntimeState();

    logger.info(
      `${this.logPrefix(persistedSessionId)} start turn; persistedSession=${persistedSessionId ? "yes" : "no"}; bundledMcpServers=${mcpServers.length}`
    );

    return {
      entry,
      mcpServers,
      runtimeState,
      persistedSessionId,
    };
  }

  private async getProcessEntry(): Promise<Awaited<ReturnType<typeof getOrStartProcess>> | null> {
    try {
      return await getOrStartProcess(this.opts.agentId);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      logger.error(`${this.logPrefix()} failed to acquire ACP process`, err);
      this.emit("event", {
        type: "error",
        code: e.code ?? "ACP_ERROR",
        message: e.message,
      } satisfies SessionEvent);
      return null;
    }
  }

  private async runStartFlow(context: StartContext, prompt: string): Promise<void> {
    if (await this.tryHandlePersistedSession(context, prompt)) {
      return;
    }

    const recovery = await this.recoverSession({
      connection: context.entry.connection,
      initializeResponse: context.entry.initializeResponse,
      runtimeState: context.runtimeState,
      persistedSessionId: context.persistedSessionId,
      mcpServers: context.mcpServers,
      prompt,
    });

    await this.completeRecoveredPrompt(context, recovery, prompt);
  }

  private async tryHandlePersistedSession(context: StartContext, prompt: string): Promise<boolean> {
    const { persistedSessionId } = context;
    if (!persistedSessionId) {
      logger.info(`${this.logPrefix()} no persisted ACP session; proceeding to new session flow`);
      return false;
    }

    this.acpSessionId = persistedSessionId;
    logger.info(`${this.logPrefix(persistedSessionId)} attempting direct prompt`);

    const directPromptResult = await this.tryDirectPrompt({
      connection: context.entry.connection,
      sessionHandlers: context.entry.sessionHandlers,
      sessionId: persistedSessionId,
      prompt,
      runtimeState: context.runtimeState,
    });

    if (directPromptResult.status === "completed") {
      logger.info(`${this.logPrefix(persistedSessionId)} direct prompt succeeded`);
      await this.persistResolvedSession(persistedSessionId);
      this.emitDone(directPromptResult.result);
      return true;
    }

    if (directPromptResult.status === "failed") {
      logger.warn(
        `${this.logPrefix(persistedSessionId)} direct prompt failed without recovery; observedUpdate=${context.runtimeState.observedSessionUpdate}; firstEvent=${context.runtimeState.firstObservedEventType ?? "none"}`
      );
      throw directPromptResult.error;
    }

    logger.warn(
      `${this.logPrefix(persistedSessionId)} direct prompt reported missing session before updates; entering recovery`
    );
    return false;
  }

  private async completeRecoveredPrompt(
    context: StartContext,
    recovery: RecoveryOutcome,
    prompt: string
  ): Promise<void> {
    if (recovery.previousSessionId && recovery.previousSessionId !== recovery.sessionId) {
      context.entry.sessionHandlers.delete(recovery.previousSessionId);
      logger.info(
        `${this.logPrefix(recovery.previousSessionId)} cleared stale session handler before switching to ${recovery.sessionId}`
      );
    }

    this.acpSessionId = recovery.sessionId;
    await this.persistResolvedSession(recovery.sessionId);

    if (this.cancelled) {
      logger.warn(
        `${this.logPrefix(recovery.sessionId)} start aborted before final prompt because session was cancelled`
      );
      return;
    }

    const reminderParts = await this.resolveReminderParts({
      createdNewSession: recovery.createdNewSession,
      recoveryHistoryReminder: recovery.recoveryHistoryReminder,
      projectPath: this.opts.projectPath,
      cwd: this.opts.cwd,
      fylloSessionId: this.opts.fylloSessionId,
      agentId: this.opts.agentId,
    });
    const promptParts: PromptPart[] = [
      ...reminderParts.map((part) => ({ type: "text" as const, text: part.text })),
      { type: "text", text: prompt },
    ];

    logger.info(
      `${this.logPrefix(recovery.sessionId)} prompt ready after ${recovery.strategy}; reminderParts=${reminderParts.length}; promptParts=${promptParts.length}`
    );

    const result = await this.runPrompt({
      connection: context.entry.connection,
      sessionHandlers: context.entry.sessionHandlers,
      runtimeState: context.runtimeState,
      sessionId: recovery.sessionId,
      prompt: promptParts,
    });
    this.emitDone(result);
  }

  private async persistResolvedSession(acpSessionId: string): Promise<void> {
    await this.opts.sessionStore.persistAcpSessionId(acpSessionId);
    logger.info(`${this.logPrefix(acpSessionId)} persisted resolved session metadata`);
    this.emit("event", {
      type: "session_id_resolved",
      acpSessionId,
    } satisfies SessionEvent);
  }

  private handleStartError(err: unknown): void {
    logger.error(`${this.logPrefix(this.acpSessionId)} acp session error`, err);
    if (this.cancelled) {
      logger.warn(
        `${this.logPrefix(this.acpSessionId)} suppressing error because session was cancelled`
      );
      return;
    }
    this.emit("event", {
      type: "error",
      code: "ACP_ERROR",
      message: promptErrorMessage(err),
    } satisfies SessionEvent);
  }

  private cleanupSessionHandler(entry: Awaited<ReturnType<typeof getOrStartProcess>>): void {
    if (!this.acpSessionId) {
      return;
    }
    entry.sessionHandlers.delete(this.acpSessionId);
    logger.info(`${this.logPrefix(this.acpSessionId)} cleaned session handler after turn`);
  }

  private logPrefix(acpSessionId?: string | null): string {
    const parts = [
      "[acp-session]",
      `[owner=${this.opts.owner}]`,
      `[fyllo=${this.opts.fylloSessionId}]`,
      `[agent=${this.opts.agentId}]`,
    ];
    if (acpSessionId) {
      parts.push(`[acp=${acpSessionId}]`);
    }
    return parts.join("");
  }

  private async tryDirectPrompt(args: {
    connection: ClientSideConnection;
    sessionHandlers: Map<string, (notification: SessionNotification) => void>;
    sessionId: string;
    prompt: string;
    runtimeState: SessionRuntimeState;
  }): Promise<
    | { status: "completed"; result: unknown }
    | { status: "recover" }
    | { status: "failed"; error: unknown }
  > {
    try {
      logger.info(`${this.logPrefix(args.sessionId)} sending direct prompt`);
      const result = await this.runPrompt({
        connection: args.connection,
        sessionHandlers: args.sessionHandlers,
        runtimeState: args.runtimeState,
        sessionId: args.sessionId,
        prompt: [{ type: "text", text: args.prompt }],
      });
      return { status: "completed", result };
    } catch (error: unknown) {
      logger.error(`${this.logPrefix(args.sessionId)} direct prompt failed`, error);
      if (!args.runtimeState.observedSessionUpdate && isSessionMissingError(error)) {
        return { status: "recover" };
      }
      return { status: "failed", error };
    }
  }

  private async recoverSession(args: {
    connection: ClientSideConnection;
    initializeResponse: InitializeResponse;
    runtimeState: SessionRuntimeState;
    persistedSessionId: string | null;
    mcpServers: AcpMcpServers;
    prompt: string;
  }): Promise<RecoveryOutcome> {
    const { connection, initializeResponse, runtimeState, persistedSessionId, mcpServers, prompt } =
      args;
    const resumeSupported = supportsResume(initializeResponse);
    const loadSupported = supportsLoad(initializeResponse);

    logger.info(
      `${this.logPrefix(persistedSessionId)} recovery capabilities; resume=${resumeSupported}; load=${loadSupported}; hasPersistedHistory=${this.recoveryContext.hasPersistedHistory}`
    );

    if (persistedSessionId && resumeSupported) {
      try {
        logger.info(`${this.logPrefix(persistedSessionId)} attempting resumeSession`);
        await connection.resumeSession({
          sessionId: persistedSessionId,
          cwd: this.opts.cwd,
          mcpServers,
        });
        logger.info(`${this.logPrefix(persistedSessionId)} resumeSession succeeded`);
        return {
          sessionId: persistedSessionId,
          createdNewSession: false,
          recoveryHistoryReminder: null,
          previousSessionId: persistedSessionId,
          strategy: "resume_session",
        };
      } catch (error: unknown) {
        logger.warn(
          `[acp-session] resumeSession failed for ${persistedSessionId}, trying next recovery path`
        );
        logger.error("[acp-session] resumeSession error", error);
        if (!isSessionMissingError(error)) {
          throw error;
        }
      }
    }

    if (persistedSessionId && loadSupported) {
      try {
        runtimeState.suppressReplay = this.recoveryContext.hasPersistedHistory;
        runtimeState.suppressedReplayEvents = 0;
        this.acpSessionId = persistedSessionId;
        logger.info(
          `${this.logPrefix(persistedSessionId)} attempting loadSession; suppressReplay=${runtimeState.suppressReplay}`
        );
        await connection.loadSession({
          sessionId: persistedSessionId,
          cwd: this.opts.cwd,
          mcpServers,
        });
        logger.info(
          `${this.logPrefix(persistedSessionId)} loadSession succeeded; suppressedReplayEvents=${runtimeState.suppressedReplayEvents}`
        );
        return {
          sessionId: persistedSessionId,
          createdNewSession: false,
          recoveryHistoryReminder: null,
          previousSessionId: persistedSessionId,
          strategy: "load_session",
        };
      } catch (error: unknown) {
        logger.warn(
          `[acp-session] loadSession failed for ${persistedSessionId}, falling back to newSession`
        );
        if (!isSessionMissingError(error)) {
          throw error;
        }
      } finally {
        if (runtimeState.suppressReplay) {
          logger.info(
            `${this.logPrefix(persistedSessionId)} loadSession replay suppression finished; suppressedReplayEvents=${runtimeState.suppressedReplayEvents}`
          );
        }
        runtimeState.suppressReplay = false;
      }
    }

    logger.warn(
      persistedSessionId
        ? `${this.logPrefix(persistedSessionId)} falling back to fresh newSession recovery`
        : `${this.logPrefix()} creating fresh newSession`
    );
    const created = await connection.newSession({ cwd: this.opts.cwd, mcpServers });
    const historyMessages = await this.recoveryContext.loadPersistedHistory();
    const recoveryHistoryReminder = buildHistoryReminder(historyMessages, prompt);
    logger.info(
      `${this.logPrefix(created.sessionId)} newSession created; historyMessages=${historyMessages.length}; historyReminder=${recoveryHistoryReminder ? "yes" : "no"}`
    );
    return {
      sessionId: created.sessionId,
      createdNewSession: true,
      recoveryHistoryReminder,
      previousSessionId: persistedSessionId ?? null,
      strategy: persistedSessionId ? "fresh_fallback" : "new_session",
    };
  }

  private async resolveReminderParts(args: {
    createdNewSession: boolean;
    recoveryHistoryReminder: TextUIPart | null;
    projectPath: string;
    cwd: string;
    fylloSessionId: string;
    agentId: string;
  }): Promise<TextUIPart[]> {
    if (!args.createdNewSession) {
      return [];
    }

    const reminderParts: TextUIPart[] = [];
    const reminderPart = await resolveSystemReminder({
      owner: this.opts.owner,
      projectPath: args.projectPath,
      cwd: args.cwd,
      fylloSessionId: args.fylloSessionId,
      agentId: args.agentId,
      ...(this.opts.reminderContext ?? {}),
    });

    if (reminderPart !== null) {
      await this.persistReminderPart(reminderPart);
      reminderParts.push(reminderPart);
    }

    if (args.recoveryHistoryReminder !== null) {
      await this.persistReminderPart(args.recoveryHistoryReminder);
      reminderParts.push(args.recoveryHistoryReminder);
    }

    logger.info(
      `${this.logPrefix(this.acpSessionId)} resolved reminder parts; count=${reminderParts.length}`
    );
    return reminderParts;
  }

  private async persistReminderPart(reminderPart: TextUIPart): Promise<void> {
    if (!this.opts.onReminderInjected) {
      return;
    }
    try {
      await this.opts.onReminderInjected(reminderPart);
    } catch (err: unknown) {
      logger.error("[acp-session] onReminderInjected failed", err);
    }
  }

  private async runPrompt(args: {
    connection: ClientSideConnection;
    sessionHandlers: Map<string, (notification: SessionNotification) => void>;
    runtimeState: SessionRuntimeState;
    sessionId: string;
    prompt: PromptPart[];
  }): Promise<unknown> {
    const sessionHandler = (notification: SessionNotification): void => {
      args.runtimeState.observedSessionUpdate = true;
      const event = mapSessionUpdate(notification.update);
      if (!event) return;
      if (args.runtimeState.firstObservedEventType === null) {
        args.runtimeState.firstObservedEventType = event.type;
        logger.info(
          `${this.logPrefix(args.sessionId)} observed first session event: ${event.type}`
        );
      }
      if (args.runtimeState.suppressReplay && shouldSuppressDuringReplay(event)) {
        args.runtimeState.suppressedReplayEvents += 1;
        return;
      }
      this.emit("event", event);
    };

    args.sessionHandlers.set(args.sessionId, sessionHandler);
    logger.info(
      `${this.logPrefix(args.sessionId)} sending prompt; promptParts=${args.prompt.length}; suppressReplay=${args.runtimeState.suppressReplay}`
    );
    return args.connection.prompt({
      sessionId: args.sessionId,
      prompt: args.prompt,
    });
  }

  private emitDone(result: unknown): void {
    const totalTokens = (result as { usage?: { outputTokens?: number } }).usage?.outputTokens ?? 0;
    logger.info(
      `${this.logPrefix(this.acpSessionId)} prompt completed; totalTokens=${totalTokens}`
    );
    this.emit("event", { type: "done", totalTokens } satisfies SessionEvent);
  }
}
