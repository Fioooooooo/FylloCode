import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import type {
  ClientSideConnection,
  InitializeResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import { mapSessionUpdate } from "./acp-mapper";
import {
  forgetActiveAcpSession,
  getOrStartProcess,
  hasActiveAcpSession,
  hasActiveMcpActivation,
} from "@main/infra/process/acp-process-pool";
import type { SessionEvent } from "@main/domain/session/chat/session-events";
import {
  buildHistoryReminder,
  createSessionRuntimeState,
  defaultRecoveryContext,
  isSessionMissingError,
  promptErrorMessage,
  shouldSuppressDuringReplay,
} from "@main/domain/session/chat/acp-session-recovery";
import type {
  RecoveryContext,
  RecoveryOutcome,
  SessionRuntimeState,
} from "@main/domain/session/chat/acp-session-recovery";
import logger from "@main/infra/logger";
import {
  createBundledMcpActivation,
  revokeBundledMcpActivation,
  toAcpMcpServer,
} from "@main/infra/mcp/bundled-mcp-servers";
import type { SessionOwner } from "@main/services/session/chat/session-registry";
import type { TextUIPart } from "ai";
import { resolveSystemReminder } from "@main/services/session/chat/system-reminder";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import { DEFAULT_CHAT_SESSION_MODE, type ChatSessionMode } from "@shared/types/chat";
import { normalizePromptCapabilities } from "@shared/types/acp-agent";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type { LineageTaskRef } from "@shared/types/lineage";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import { activateAcpSession } from "./acp-session-activation";
import {
  applySessionConfigOverrides,
  recoverSessionConfig,
  type ConfigOverrideWarning,
} from "./session-config-recovery-service";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import { assertAgentWorkspaceCompatibility } from "./agent-workspace-compatibility";
import { renderWorkspaceSection } from "./system-reminder/providers/workspace";
import { readAttachmentDataUrl } from "@main/infra/storage/attachment-store";
import { resolveSessionMemberResource } from "./member-resource-resolver";
import type { McpWorkspaceDescriptorV2 } from "@shared/types/mcp-workspace";
import { createSessionMcpWorkspaceDescriptor } from "./mcp-workspace-descriptor";
import { createChatRuntimeProfile, createSpawnRuntimeProfile } from "./session-runtime-profile";
import { assertSessionWorkspaceSnapshotCurrent } from "./session-workspace-service";

interface ReminderContext {
  changeId?: string;
  stageIndex?: number;
  runId?: string;
  worktreePath?: string;
  folderId?: string;
  folderName?: string;
  taskRef?: LineageTaskRef;
  taskTitle?: string;
}

type PromptPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "resource_link"; uri: string; name: string; mimeType: string };
interface StartContext {
  entry: Awaited<ReturnType<typeof getOrStartProcess>>;
  mcpWorkspaceDescriptor?: McpWorkspaceDescriptorV2;
  runtimeState: SessionRuntimeState;
  recoveryState: AcpSessionRecoveryState;
}

interface ReconciledRecoveryOutcome extends RecoveryOutcome {
  configOptions: AcpSessionConfigOption[];
}

export interface AcpSessionOpts {
  fylloSessionId: string;
  agentId: string;
  workspaceId: string;
  projectPath: string;
  cwd: string;
  additionalDirectories: string[];
  workspaceSnapshot?: SessionWorkspaceSnapshot;
  sessionMode?: ChatSessionMode;
  mcpWorkspaceDescriptor?: McpWorkspaceDescriptorV2;
  owner: SessionOwner;
  sessionStore: AcpSessionStore;
  reminderContext?: ReminderContext;
  onReminderInjected?: (reminderPart: TextUIPart) => Promise<void>;
  recoveryContext?: Partial<RecoveryContext>;
  presetAcpSessionId?: string;
  configOverrides?: Record<string, string | boolean>;
  onConfigWarnings?: (warnings: ConfigOverrideWarning[]) => void;
}

/**
 * Manages one turn of an ACP-backed chat session.
 *
 * Responsibilities:
 * - Acquire or reuse an ACP agent process.
 * - Resolve the ACP session id (preset → resume → load → new session fallback).
 * - Inject system reminders and history reminders when a fresh session is created.
 * - Dispatch the prompt and forward `SessionEvent`s to listeners.
 * - Handle cancellation and per-turn cleanup.
 */
export class AcpSession extends EventEmitter {
  private acpSessionId: string | null = null;
  private cancelled = false;
  // Track ACP session ids we have already cancelled to avoid duplicate cancel() calls
  // when the user cancels around the moment a session id is resolved.
  private readonly cancelledAcpSessionIds = new Set<string>();
  private readonly recoveryContext: RecoveryContext;
  private readonly presetAcpSessionId?: string;
  private processEntry: Awaited<ReturnType<typeof getOrStartProcess>> | null = null;

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
    const entry = this.processEntry;
    if (entry) {
      void entry.connection.cancel({ sessionId: acpSessionId }).catch(() => {});
      return;
    }
    getOrStartProcess(this.opts.agentId)
      .then((resolvedEntry) => {
        this.processEntry = resolvedEntry;
        return resolvedEntry.connection.cancel({ sessionId: acpSessionId });
      })
      .catch(() => {});
  }

  private async prepareStartContext(): Promise<StartContext | null> {
    let mcpWorkspaceDescriptor: McpWorkspaceDescriptorV2 | undefined;
    if (this.opts.owner === "chat") {
      if (!this.opts.workspaceSnapshot) {
        throw ipcError(
          IpcErrorCodes.VALIDATION_ERROR,
          "Chat ACP Session requires a frozen Workspace snapshot"
        );
      }
      if ((this.opts.sessionMode ?? DEFAULT_CHAT_SESSION_MODE) === "fyllocode") {
        mcpWorkspaceDescriptor = await createSessionMcpWorkspaceDescriptor(
          this.opts.workspaceSnapshot,
          this.opts.fylloSessionId
        );
        renderWorkspaceSection(this.opts.workspaceSnapshot);
      } else {
        await assertSessionWorkspaceSnapshotCurrent(this.opts.workspaceSnapshot);
      }
      await assertAgentWorkspaceCompatibility(this.opts.agentId, this.opts.workspaceSnapshot);
    } else if (this.opts.owner === "spawn") {
      if (!this.opts.workspaceSnapshot) {
        throw ipcError(
          IpcErrorCodes.VALIDATION_ERROR,
          "Spawn ACP Session requires a frozen Workspace snapshot"
        );
      }
      await assertSessionWorkspaceSnapshotCurrent(this.opts.workspaceSnapshot);
      await assertAgentWorkspaceCompatibility(this.opts.agentId, this.opts.workspaceSnapshot);
    } else {
      if (!this.opts.mcpWorkspaceDescriptor) {
        throw ipcError(
          IpcErrorCodes.VALIDATION_ERROR,
          `${this.opts.owner} ACP Session requires an owner-only MCP Workspace descriptor`
        );
      }
      mcpWorkspaceDescriptor = this.opts.mcpWorkspaceDescriptor;
    }
    const entry = await this.getProcessEntry();
    if (!entry) {
      return null;
    }
    if (this.cancelled) {
      logger.warn(`${this.logPrefix()} start aborted after ACP process acquisition`);
      return null;
    }

    const recoveryState = await this.opts.sessionStore.loadRecoveryState();
    const persistedSessionId = recoveryState.acpSessionId;
    if (this.cancelled) {
      logger.warn(
        `${this.logPrefix(persistedSessionId)} start aborted after session metadata load`
      );
      return null;
    }
    const runtimeState = createSessionRuntimeState();

    logger.info(
      `${this.logPrefix(persistedSessionId)} start turn; persistedSession=${persistedSessionId ? "yes" : "no"}; mcpActivation=deferred`
    );

    return {
      entry,
      mcpWorkspaceDescriptor,
      runtimeState,
      recoveryState,
    };
  }

  private async getProcessEntry(): Promise<Awaited<ReturnType<typeof getOrStartProcess>> | null> {
    try {
      const entry = await getOrStartProcess(this.opts.agentId);
      this.processEntry = entry;
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

    // Start-flow priority:
    // 1. Use a caller-provided preset session id (e.g. a probe session promoted to chat).
    // 2. Try to continue the persisted ACP session directly.
    // 3. Recover via resume → load → new session fallback.
    if (this.presetAcpSessionId !== undefined) {
      await this.runPresetFlow(context, parts);
      return;
    }

    if (await this.tryHandlePersistedSession(context, parts)) {
      return;
    }

    this.throwIfCancelled("before recovery flow");
    const recovery = await this.recoverSession({
      entry: context.entry,
      initializeResponse: context.entry.initializeResponse,
      runtimeState: context.runtimeState,
      recoveryState: context.recoveryState,
      mcpWorkspaceDescriptor: context.mcpWorkspaceDescriptor,
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

    // A preset session id bypasses resume/load/new recovery. This is used when a session id
    // has already been established externally (e.g. a probe session reused for the chat turn).
    this.acpSessionId = acpSessionId;
    if (!hasActiveMcpActivation(context.entry, acpSessionId)) {
      throw new Error(`Preset ACP Session ${acpSessionId} has no active MCP activation`);
    }
    logger.info(`${this.logPrefix(acpSessionId)} using preset ACP session`);

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
    const persistedSessionId = context.recoveryState.acpSessionId;
    if (!persistedSessionId) {
      logger.info(`${this.logPrefix()} no persisted ACP session; proceeding to new session flow`);
      return false;
    }
    const acpSessionActive = hasActiveAcpSession(context.entry, persistedSessionId);
    const mcpActivationActive =
      acpSessionActive && hasActiveMcpActivation(context.entry, persistedSessionId);
    if (!acpSessionActive || !mcpActivationActive) {
      logger.info(
        `${this.logPrefix(persistedSessionId)} persisted session or MCP lease is cold; entering recovery; acpSessionActive=${acpSessionActive}; mcpActivationActive=${mcpActivationActive}`
      );
      forgetActiveAcpSession(context.entry, persistedSessionId, "cold-recovery");
      return false;
    }

    // Try to continue the previous ACP session with a direct prompt. If the session is gone,
    // fall back to recovery instead of failing immediately.
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
    forgetActiveAcpSession(context.entry, persistedSessionId);
    return false;
  }

  private async completeRecoveredPrompt(
    context: StartContext,
    recovery: ReconciledRecoveryOutcome,
    parts: ChatPromptPart[]
  ): Promise<void> {
    if (recovery.previousSessionId && recovery.previousSessionId !== recovery.sessionId) {
      context.entry.sessionHandlers.delete(recovery.previousSessionId);
      forgetActiveAcpSession(context.entry, recovery.previousSessionId);
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

    this.emitConfigOptions(recovery.configOptions);
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

  private emitConfigOptions(options: AcpSessionConfigOption[]): void {
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
    entry: Awaited<ReturnType<typeof getOrStartProcess>>;
    initializeResponse: InitializeResponse;
    runtimeState: SessionRuntimeState;
    recoveryState: AcpSessionRecoveryState;
    mcpWorkspaceDescriptor?: McpWorkspaceDescriptorV2;
    prompt: string;
  }): Promise<ReconciledRecoveryOutcome> {
    const {
      entry,
      initializeResponse,
      runtimeState,
      recoveryState,
      mcpWorkspaceDescriptor,
      prompt,
    } = args;
    const persistedSessionId = recoveryState.acpSessionId;

    logger.info(
      `${this.logPrefix(persistedSessionId)} starting cold recovery; hasPersistedHistory=${this.recoveryContext.hasPersistedHistory}`
    );

    this.throwIfCancelled("before session activation");
    const activation = await activateAcpSession({
      entry,
      initializeResponse,
      persistedSessionId,
      cwd: this.opts.cwd,
      additionalDirectories: this.opts.additionalDirectories,
      createMcpActivation: async () => {
        const supportsHttp =
          entry.initializeResponse.agentCapabilities?.mcpCapabilities?.http === true;
        if (this.opts.owner === "chat") {
          if (!this.opts.workspaceSnapshot) {
            throw ipcError(
              IpcErrorCodes.VALIDATION_ERROR,
              "Chat ACP Session requires a frozen Workspace snapshot"
            );
          }
          return createChatRuntimeProfile({
            sessionMode: this.opts.sessionMode ?? DEFAULT_CHAT_SESSION_MODE,
            agentId: this.opts.agentId,
            workspaceSnapshot: this.opts.workspaceSnapshot,
            fylloSessionId: this.opts.fylloSessionId,
            supportsHttp,
            ...(mcpWorkspaceDescriptor ? { mcpWorkspaceDescriptor } : {}),
          });
        }
        if (this.opts.owner === "spawn") {
          return createSpawnRuntimeProfile();
        }
        if (!mcpWorkspaceDescriptor) {
          throw ipcError(
            IpcErrorCodes.VALIDATION_ERROR,
            `${this.opts.owner} ACP Session requires an owner-only MCP Workspace descriptor`
          );
        }
        const activation = await createBundledMcpActivation({
          agentId: this.opts.agentId,
          descriptor: mcpWorkspaceDescriptor,
          supportsHttp,
        });
        return {
          mcpServers: activation.servers.map(toAcpMcpServer),
          mcpActivationId: activation.activationId,
          revoke: () => revokeBundledMcpActivation(activation.activationId),
        };
      },
      allowFreshSession: true,
      checkCancelled: (stage) => this.throwIfCancelled(stage),
      onNewSessionCreated: (sessionId) => {
        this.acpSessionId = sessionId;
      },
      onLoadStart: (sessionId) => {
        runtimeState.suppressReplay = this.recoveryContext.hasPersistedHistory;
        runtimeState.suppressedReplayEvents = 0;
        this.acpSessionId = sessionId;
        logger.info(
          `${this.logPrefix(sessionId)} loadSession replay suppression started; suppressReplay=${runtimeState.suppressReplay}`
        );
      },
      onLoadFinish: (sessionId) => {
        logger.info(
          `${this.logPrefix(sessionId)} loadSession replay suppression finished; suppressedReplayEvents=${runtimeState.suppressedReplayEvents}`
        );
        runtimeState.suppressReplay = false;
      },
    });
    this.acpSessionId = activation.sessionId;
    let configOptions: AcpSessionConfigOption[];
    try {
      this.throwIfCancelled("after session activation");
      configOptions = await recoverSessionConfig({
        connection: entry.connection,
        sessionId: activation.sessionId,
        persistedOptions: recoveryState.configOptions,
        liveOptions: activation.configOptions,
      });
      if (this.opts.configOverrides && Object.keys(this.opts.configOverrides).length > 0) {
        const overrideResult = await applySessionConfigOverrides({
          connection: entry.connection,
          sessionId: activation.sessionId,
          liveOptions: configOptions,
          overrides: this.opts.configOverrides,
        });
        configOptions = overrideResult.options;
        this.opts.onConfigWarnings?.(overrideResult.warnings);
      }
      this.throwIfCancelled("after config recovery");
    } catch (error: unknown) {
      // 仅完成 activation 还不能安全复用 direct prompt；恢复失败或取消后，
      // 下一轮必须重新进入 cold recovery，避免静默使用 Agent 默认配置。
      forgetActiveAcpSession(entry, activation.sessionId);
      throw error;
    }

    let recoveryHistoryReminder: TextUIPart | null = null;
    if (
      activation.createdNewSession &&
      this.opts.owner !== "spawn" &&
      !(this.opts.owner === "chat" && this.opts.sessionMode === "native")
    ) {
      const historyMessages = await this.recoveryContext.loadPersistedHistory();
      this.throwIfCancelled("after loading persisted history");
      recoveryHistoryReminder = buildHistoryReminder(historyMessages, prompt);
    }
    logger.info(
      `${this.logPrefix(activation.sessionId)} cold recovery completed via ${activation.strategy}; historyReminder=${recoveryHistoryReminder ? "yes" : "no"}`
    );
    return {
      sessionId: activation.sessionId,
      createdNewSession: activation.createdNewSession,
      recoveryHistoryReminder,
      previousSessionId: activation.previousSessionId,
      strategy: activation.strategy,
      configOptions,
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
    if (
      this.opts.owner === "spawn" ||
      (this.opts.owner === "chat" && this.opts.sessionMode === "native")
    ) {
      return [];
    }
    // Reminders are only injected when a brand-new ACP session is created. Resumed/loaded sessions
    // already carry the agent's internal context, so injecting reminders again would duplicate them.
    if (!args.createdNewSession) {
      return [];
    }

    const reminderParts: TextUIPart[] = [];
    if (this.cancelled) {
      return reminderParts;
    }

    const reminderPart = await resolveSystemReminder({
      owner: this.opts.owner,
      workspaceId: this.opts.workspaceId,
      projectPath: args.projectPath,
      cwd: args.cwd,
      fylloSessionId: args.fylloSessionId,
      agentId: args.agentId,
      workspaceSnapshot: this.opts.workspaceSnapshot,
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

    // Register a handler that maps ACP sessionUpdate notifications to our internal SessionEvent
    // stream. Drop replay events when suppression is active (see loadSession recovery).
    const sessionHandler = (notification: SessionNotification): void => {
      if (this.cancelled) {
        return;
      }

      args.runtimeState.observedSessionUpdate = true;
      const event = mapSessionUpdate(notification.update, { agentId: this.opts.agentId });
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
    const hasImage = parts.some(
      (part) =>
        part.type === "image" || (part.type === "attachment" && part.mediaType.startsWith("image/"))
    );
    const hasEmbeddedContext = parts.some(
      (part) =>
        part.type === "resource_link" ||
        part.type === "workspace_file" ||
        (part.type === "attachment" && !part.mediaType.startsWith("image/"))
    );
    if (hasImage && !capabilities.image) {
      throw ipcError(IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH, "当前 agent 不支持图片输入");
    }
    if (hasEmbeddedContext && !capabilities.embeddedContext) {
      throw ipcError(IpcErrorCodes.PROMPT_CAPABILITY_MISMATCH, "当前 agent 不支持文件输入");
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
      if (part.type === "attachment") {
        const dataUrl = await readAttachmentDataUrl(
          this.opts.workspaceId,
          this.opts.fylloSessionId,
          part.attachmentId,
          part.mediaType
        );
        if (part.mediaType.startsWith("image/")) {
          const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
          promptParts.push({ type: "image", mimeType: part.mediaType, data });
        } else {
          promptParts.push({
            type: "resource_link",
            uri: dataUrl,
            name: part.filename,
            mimeType: part.mediaType,
          });
        }
        continue;
      }
      if (part.type === "workspace_file") {
        if (this.opts.owner !== "chat" || !this.opts.workspaceSnapshot) {
          throw ipcError(
            IpcErrorCodes.SESSION_RESOURCE_UNAUTHORIZED,
            "Workspace file resources require a Chat Session snapshot"
          );
        }
        const resource = await resolveSessionMemberResource(this.opts.workspaceSnapshot, part.ref);
        promptParts.push({
          type: "resource_link",
          uri: resource.uri,
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
        throw ipcError(IpcErrorCodes.ACP_ERROR, "无法读取附件文件");
      }
    }
    return promptParts;
  }

  private getPrimaryTextPrompt(parts: ChatPromptPart[]): string {
    return parts.find((part) => part.type === "text")?.text ?? "";
  }

  private emitDone(result: unknown): void {
    const totalTokens = (result as { usage?: { outputTokens?: number } }).usage?.outputTokens ?? 0;
    logger.info(
      `${this.logPrefix(this.acpSessionId)} prompt completed; totalTokens=${totalTokens}`
    );
    this.emit("event", { kind: "done", totalTokens } satisfies SessionEvent);
  }
}
