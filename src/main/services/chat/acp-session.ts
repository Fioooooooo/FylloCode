import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import type {
  ClientSideConnection,
  InitializeResponse,
  SessionConfigOption,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { AcpSessionStore } from "@main/domain/chat/acp-session-store";
import { mapSessionUpdate, normalizeAcpSessionConfigOptions } from "./acp-mapper";
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
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import { normalizePromptCapabilities } from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { LineageTaskRef } from "@shared/types/lineage";

interface ReminderContext {
  changeId?: string;
  stageIndex?: number;
  runId?: string;
  worktreePath?: string;
  taskRef?: LineageTaskRef;
  taskTitle?: string;
}

type PromptPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "resource_link"; uri: string; name: string; mimeType: string };
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
  presetAcpSessionId?: string;
}

export class AcpSession extends EventEmitter {
  private acpSessionId: string | null = null;
  private cancelled = false;
  private readonly cancelledAcpSessionIds = new Set<string>();
  private readonly recoveryContext: RecoveryContext;
  private readonly presetAcpSessionId?: string;

  constructor(private readonly opts: AcpSessionOpts) {
    super();
    this.presetAcpSessionId = opts.presetAcpSessionId;
    this.recoveryContext = {
      ...defaultRecoveryContext(),
      ...(opts.recoveryContext ?? {}),
    };
  }

  async start(parts: ChatPromptPart[]): Promise<void> {
    const context = await this.prepareStartContext();
    if (!context) {
      return;
    }

    try {
      await this.runStartFlow(context, parts);
    } catch (err: unknown) {
      this.handleStartError(err);
    } finally {
      this.cleanupSessionHandler(context.entry);
    }
  }

  cancel(): void {
    this.cancelled = true;
    const acpSessionId = this.acpSessionId;
    if (!acpSessionId) return;

    this.cancelResolvedAcpSession(acpSessionId);
  }

  private cancelResolvedAcpSession(acpSessionId: string): void {
    if (this.cancelledAcpSessionIds.has(acpSessionId)) {
      return;
    }

    this.cancelledAcpSessionIds.add(acpSessionId);
    getOrStartProcess(this.opts.agentId)
      .then(({ connection }) => connection.cancel({ sessionId: acpSessionId }))
      .catch(() => {});
  }

  private async prepareStartContext(): Promise<StartContext | null> {
    const entry = await this.getProcessEntry();
    if (!entry) {
      return null;
    }
    if (this.cancelled) {
      logger.warn(`${this.logPrefix()} start aborted after ACP process acquisition`);
      return null;
    }

    const mcpServers: AcpMcpServers = getBundledMcpServers({
      projectPath: this.opts.projectPath,
      fylloSessionId: this.opts.fylloSessionId,
    }).map((spec) => ({
      ...spec,
      env: toAcpMcpServerEnv(spec.env),
    }));
    const persistedSessionId = await this.opts.sessionStore.loadAcpSessionId();
    if (this.cancelled) {
      logger.warn(
        `${this.logPrefix(persistedSessionId)} start aborted after session metadata load`
      );
      return null;
    }
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
      const entry = await getOrStartProcess(this.opts.agentId);
      if (this.cancelled) {
        logger.warn(`${this.logPrefix()} start aborted after ACP process resolved`);
        return null;
      }
      return entry;
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      logger.error(`${this.logPrefix()} failed to acquire ACP process`, err);
      this.emit("event", {
        kind: "error",
        code: e.code ?? "ACP_ERROR",
        message: e.message,
      } satisfies SessionEvent);
      return null;
    }
  }

  private async runStartFlow(context: StartContext, parts: ChatPromptPart[]): Promise<void> {
    this.throwIfCancelled("before start flow");
    this.assertPromptCapabilities(context.entry.initializeResponse, parts);

    if (this.presetAcpSessionId !== undefined) {
      await this.runPresetFlow(context, parts);
      return;
    }

    if (await this.tryHandlePersistedSession(context, parts)) {
      return;
    }

    this.throwIfCancelled("before recovery flow");
    const recovery = await this.recoverSession({
      connection: context.entry.connection,
      initializeResponse: context.entry.initializeResponse,
      runtimeState: context.runtimeState,
      persistedSessionId: context.persistedSessionId,
      mcpServers: context.mcpServers,
      prompt: this.getPrimaryTextPrompt(parts),
    });

    this.throwIfCancelled("after recovery flow");
    await this.completeRecoveredPrompt(context, recovery, parts);
  }

  private async runPresetFlow(context: StartContext, parts: ChatPromptPart[]): Promise<void> {
    const acpSessionId = this.presetAcpSessionId;
    if (acpSessionId === undefined) {
      return;
    }

    this.acpSessionId = acpSessionId;
    logger.info(`${this.logPrefix(acpSessionId)} using preset ACP session`);
    await this.opts.sessionStore.loadAcpSessionId();

    this.throwIfCancelled("before preset persist");
    await this.persistResolvedSession(acpSessionId);
    this.throwIfCancelled("before preset reminder");

    const reminderParts = await this.resolveReminderParts({
      createdNewSession: true,
      recoveryHistoryReminder: null,
      projectPath: this.opts.projectPath,
      cwd: this.opts.cwd,
      fylloSessionId: this.opts.fylloSessionId,
      agentId: this.opts.agentId,
    });
    this.throwIfCancelled("after preset reminder");

    const promptParts: PromptPart[] = [
      ...reminderParts.map((part) => ({ type: "text" as const, text: part.text })),
      ...(await this.toAcpPromptParts(parts)),
    ];

    logger.info(
      `${this.logPrefix(acpSessionId)} preset prompt ready; reminderParts=${reminderParts.length}; promptParts=${promptParts.length}`
    );

    const result = await this.runPrompt({
      connection: context.entry.connection,
      sessionHandlers: context.entry.sessionHandlers,
      runtimeState: context.runtimeState,
      sessionId: acpSessionId,
      prompt: promptParts,
    });
    this.throwIfCancelled("after preset prompt");
    this.emitDone(result);
  }

  private async tryHandlePersistedSession(
    context: StartContext,
    parts: ChatPromptPart[]
  ): Promise<boolean> {
    const { persistedSessionId } = context;
    if (!persistedSessionId) {
      logger.info(`${this.logPrefix()} no persisted ACP session; proceeding to new session flow`);
      return false;
    }

    this.acpSessionId = persistedSessionId;
    logger.info(`${this.logPrefix(persistedSessionId)} attempting direct prompt`);
    this.throwIfCancelled("before direct prompt");

    const directPromptResult = await this.tryDirectPrompt({
      connection: context.entry.connection,
      sessionHandlers: context.entry.sessionHandlers,
      sessionId: persistedSessionId,
      prompt: parts,
      runtimeState: context.runtimeState,
    });
    this.throwIfCancelled("after direct prompt");

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
    parts: ChatPromptPart[]
  ): Promise<void> {
    if (recovery.previousSessionId && recovery.previousSessionId !== recovery.sessionId) {
      context.entry.sessionHandlers.delete(recovery.previousSessionId);
      logger.info(
        `${this.logPrefix(recovery.previousSessionId)} cleared stale session handler before switching to ${recovery.sessionId}`
      );
    }

    this.acpSessionId = recovery.sessionId;
    if (this.cancelled) {
      this.cancelResolvedAcpSession(recovery.sessionId);
      logger.warn(
        `${this.logPrefix(recovery.sessionId)} start aborted before persisting recovered session because session was cancelled`
      );
      return;
    }

    await this.persistResolvedSession(recovery.sessionId);

    if (this.cancelled) {
      this.cancelResolvedAcpSession(recovery.sessionId);
      logger.warn(
        `${this.logPrefix(recovery.sessionId)} start aborted before final prompt because session was cancelled`
      );
      return;
    }

    this.throwIfCancelled("before resolving reminder");
    const reminderParts = await this.resolveReminderParts({
      createdNewSession: recovery.createdNewSession,
      recoveryHistoryReminder: recovery.recoveryHistoryReminder,
      projectPath: this.opts.projectPath,
      cwd: this.opts.cwd,
      fylloSessionId: this.opts.fylloSessionId,
      agentId: this.opts.agentId,
    });
    this.throwIfCancelled("after resolving reminder");
    const promptParts: PromptPart[] = [
      ...reminderParts.map((part) => ({ type: "text" as const, text: part.text })),
      ...(await this.toAcpPromptParts(parts)),
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
    this.throwIfCancelled("after prompt");
    this.emitDone(result);
  }

  private async persistResolvedSession(acpSessionId: string): Promise<void> {
    await this.opts.sessionStore.persistAcpSessionId(acpSessionId);
    logger.info(`${this.logPrefix(acpSessionId)} persisted resolved session metadata`);
    this.emit("event", {
      kind: "session_id_resolved",
      acpSessionId,
    } satisfies SessionEvent);
  }

  private emitConfigOptions(raw: SessionConfigOption[] | null | undefined): void {
    const options = normalizeAcpSessionConfigOptions(raw);
    this.emit("event", {
      kind: "config_options_update",
      options,
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
    const e = err as Error & { code?: string };
    this.emit("event", {
      kind: "error",
      code: typeof e.code === "string" ? e.code : "ACP_ERROR",
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

  private throwIfCancelled(stage: string): void {
    if (!this.cancelled) {
      return;
    }

    if (this.acpSessionId) {
      this.cancelResolvedAcpSession(this.acpSessionId);
    }
    logger.warn(`${this.logPrefix(this.acpSessionId)} start aborted ${stage}`);
    throw new Error("ACP session cancelled");
  }

  private async tryDirectPrompt(args: {
    connection: ClientSideConnection;
    sessionHandlers: Map<string, (notification: SessionNotification) => void>;
    sessionId: string;
    prompt: ChatPromptPart[];
    runtimeState: SessionRuntimeState;
  }): Promise<
    | { status: "completed"; result: unknown }
    | { status: "recover" }
    | { status: "failed"; error: unknown }
  > {
    try {
      this.throwIfCancelled("before direct prompt dispatch");
      logger.info(`${this.logPrefix(args.sessionId)} sending direct prompt`);
      const result = await this.runPrompt({
        connection: args.connection,
        sessionHandlers: args.sessionHandlers,
        runtimeState: args.runtimeState,
        sessionId: args.sessionId,
        prompt: await this.toAcpPromptParts(args.prompt),
      });
      return { status: "completed", result };
    } catch (error: unknown) {
      if (this.cancelled) {
        throw error;
      }
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
        this.throwIfCancelled("before resumeSession");
        logger.info(`${this.logPrefix(persistedSessionId)} attempting resumeSession`);
        const resumeResponse = await connection.resumeSession({
          sessionId: persistedSessionId,
          cwd: this.opts.cwd,
          mcpServers,
        });
        this.throwIfCancelled("after resumeSession");
        logger.info(`${this.logPrefix(persistedSessionId)} resumeSession succeeded`);
        this.emitConfigOptions(resumeResponse.configOptions);
        return {
          sessionId: persistedSessionId,
          createdNewSession: false,
          recoveryHistoryReminder: null,
          previousSessionId: persistedSessionId,
          strategy: "resume_session",
        };
      } catch (error: unknown) {
        if (this.cancelled) {
          throw error;
        }
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
        this.throwIfCancelled("before loadSession");
        runtimeState.suppressReplay = this.recoveryContext.hasPersistedHistory;
        runtimeState.suppressedReplayEvents = 0;
        this.acpSessionId = persistedSessionId;
        logger.info(
          `${this.logPrefix(persistedSessionId)} attempting loadSession; suppressReplay=${runtimeState.suppressReplay}`
        );
        const loadResponse = await connection.loadSession({
          sessionId: persistedSessionId,
          cwd: this.opts.cwd,
          mcpServers,
        });
        this.throwIfCancelled("after loadSession");
        logger.info(
          `${this.logPrefix(persistedSessionId)} loadSession succeeded; suppressedReplayEvents=${runtimeState.suppressedReplayEvents}`
        );
        this.emitConfigOptions(loadResponse.configOptions);
        return {
          sessionId: persistedSessionId,
          createdNewSession: false,
          recoveryHistoryReminder: null,
          previousSessionId: persistedSessionId,
          strategy: "load_session",
        };
      } catch (error: unknown) {
        if (this.cancelled) {
          throw error;
        }
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
    this.throwIfCancelled("before newSession");
    const created = await connection.newSession({ cwd: this.opts.cwd, mcpServers });
    logger.info("SessionCreated", JSON.stringify(created.configOptions));

    this.acpSessionId = created.sessionId;
    this.throwIfCancelled("after newSession");
    const historyMessages = await this.recoveryContext.loadPersistedHistory();
    this.throwIfCancelled("after loading persisted history");
    const recoveryHistoryReminder = buildHistoryReminder(historyMessages, prompt);
    logger.info(
      `${this.logPrefix(created.sessionId)} newSession created; historyMessages=${historyMessages.length}; historyReminder=${recoveryHistoryReminder ? "yes" : "no"}`
    );
    this.emitConfigOptions(created.configOptions);
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
    if (this.cancelled) {
      return reminderParts;
    }

    const reminderPart = await resolveSystemReminder({
      owner: this.opts.owner,
      projectPath: args.projectPath,
      cwd: args.cwd,
      fylloSessionId: args.fylloSessionId,
      agentId: args.agentId,
      ...(this.opts.reminderContext ?? {}),
    });

    if (this.cancelled) {
      return reminderParts;
    }

    if (reminderPart !== null) {
      await this.persistReminderPart(reminderPart);
      reminderParts.push(reminderPart);
    }

    if (this.cancelled) {
      return reminderParts;
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
    this.throwIfCancelled("before prompt dispatch");

    const sessionHandler = (notification: SessionNotification): void => {
      if (this.cancelled) {
        return;
      }

      args.runtimeState.observedSessionUpdate = true;
      const event = mapSessionUpdate(notification.update);
      if (!event) return;
      if (args.runtimeState.firstObservedEventType === null) {
        args.runtimeState.firstObservedEventType = event.kind;
        logger.info(
          `${this.logPrefix(args.sessionId)} observed first session event: ${event.kind}`
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

  private assertPromptCapabilities(
    initializeResponse: InitializeResponse,
    parts: ChatPromptPart[]
  ): void {
    const capabilities = normalizePromptCapabilities(
      initializeResponse.agentCapabilities?.promptCapabilities
    );
    if (parts.some((part) => part.type === "image") && !capabilities.image) {
      throw this.createAcpError(
        IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH,
        "当前 agent 不支持图片输入"
      );
    }
    if (parts.some((part) => part.type === "resource_link") && !capabilities.embeddedContext) {
      throw this.createAcpError(
        IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH,
        "当前 agent 不支持文件输入"
      );
    }
  }

  private async toAcpPromptParts(parts: ChatPromptPart[]): Promise<PromptPart[]> {
    const promptParts: PromptPart[] = [];
    for (const part of parts) {
      if (part.type === "text") {
        promptParts.push({ type: "text", text: part.text });
        continue;
      }
      if (part.type === "resource_link") {
        promptParts.push({
          type: "resource_link",
          uri: part.uri,
          name: part.filename,
          mimeType: part.mediaType,
        });
        continue;
      }

      try {
        const data = await fs.readFile(fileURLToPath(part.uri));
        promptParts.push({
          type: "image",
          mimeType: part.mediaType,
          data: data.toString("base64"),
        });
      } catch {
        throw this.createAcpError(IpcErrorCodes.ACP_ERROR, "无法读取附件文件");
      }
    }
    return promptParts;
  }

  private getPrimaryTextPrompt(parts: ChatPromptPart[]): string {
    return parts.find((part) => part.type === "text")?.text ?? "";
  }

  private createAcpError(code: string, message: string): Error & { code: string } {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
  }

  private emitDone(result: unknown): void {
    const totalTokens = (result as { usage?: { outputTokens?: number } }).usage?.outputTokens ?? 0;
    logger.info(
      `${this.logPrefix(this.acpSessionId)} prompt completed; totalTokens=${totalTokens}`
    );
    this.emit("event", { kind: "done", totalTokens } satisfies SessionEvent);
  }
}
