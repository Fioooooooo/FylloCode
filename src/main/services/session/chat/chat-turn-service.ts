import { generateId, type UIMessage } from "ai";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { DEFAULT_CHAT_SESSION_MODE, type MessageMeta } from "@shared/types/chat";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import { assertAgentWorkspaceCompatibility } from "@main/services/session/chat/agent-workspace-compatibility";
import { ensureSessionWorkspaceSnapshot } from "@main/services/session/chat/chat-service";
import { chatTurnGate, type ChatTurnLease } from "@main/services/session/chat/chat-turn-gate";
import { AcpSession } from "@main/services/session/chat/acp-session";
import {
  driveAcpStream,
  type AcpTurnCompletion,
  type AcpTurnRunner,
  type StreamOutput,
} from "@main/services/session/chat/acp-stream-driver";
import { getByTask } from "@main/services/insight/_public";
import { takeProbeFor } from "@main/services/session/chat/session-probe-service";
import { ChatAcpSessionStore } from "@main/infra/storage/chat-acp-session-store";
import {
  appendMessage,
  loadMessages,
  loadSessionMeta,
  patchMessageMetadata,
  patchSessionMeta,
  sessionMessagesPath,
} from "@main/infra/storage/session-store";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { toMessageChunk } from "@main/services/session/chat/session-event-mapper";
import logger from "@main/infra/logger";
import { spawnNotificationService } from "@main/services/session/spawn/spawn-notification-service";
import type { SpawnedTurnRecord } from "@main/infra/storage/spawned-session-store";
import type { WorkflowDecisionRecord } from "@main/infra/storage/workflow-decision-store";
import type { WorkflowProposalRecord } from "@main/infra/storage/workflow-proposal-store";
import { workflowDecisionService } from "@main/services/automation/_public";
import type { WorkflowProposalPersist } from "@shared/types/workflow";

interface RendererChatTurnInput {
  workspaceId: string;
  sessionId: string;
  agentId?: string;
  prompt: ChatPromptPart[];
  userMessageId?: string;
  acpSessionId?: string;
}

interface PreparedChatTurn {
  session: AcpSession;
  agentId: string;
  enqueueControlEvent: (event: Parameters<typeof toMessageChunk>[0], output?: StreamOutput) => void;
  settleMeta: (totalTokens: number) => Promise<void>;
}

function chatError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

async function prepareChatTurn(input: RendererChatTurnInput): Promise<PreparedChatTurn> {
  const meta = await loadSessionMeta(input.workspaceId, input.sessionId);
  if (!meta) {
    throw chatError(IpcErrorCodes.CHAT_SESSION_NOT_FOUND, `Session not found: ${input.sessionId}`);
  }
  const agentId = input.agentId || meta.agentId;
  if (!agentId) throw chatError(IpcErrorCodes.VALIDATION_ERROR, "agentId is required");
  const sessionMode = meta.sessionMode ?? DEFAULT_CHAT_SESSION_MODE;
  const workspaceSnapshot = await ensureSessionWorkspaceSnapshot(
    input.workspaceId,
    input.sessionId
  );
  await assertAgentWorkspaceCompatibility(agentId, workspaceSnapshot);

  let taskTitle: string | undefined;
  if (meta.originTaskRef) {
    try {
      const taskProjection = await getByTask(input.workspaceId, meta.originTaskRef);
      taskTitle = taskProjection?.task?.snapshot.title || undefined;
    } catch (error: unknown) {
      logger.warn("[chat] failed to load task title for system reminder", error);
    }
  }

  let presetAcpSessionId: string | undefined;
  if (input.acpSessionId) {
    const probeEntry = await takeProbeFor(
      input.workspaceId,
      agentId,
      input.acpSessionId,
      sessionMode
    );
    if (!probeEntry) {
      throw chatError(IpcErrorCodes.VALIDATION_ERROR, "probe acpSessionId 不匹配或已被 consume");
    }
    await patchSessionMeta(input.workspaceId, input.sessionId, {
      acpSessionId: input.acpSessionId,
      agentId,
      configOptions: probeEntry.configOptions,
      available_commands: probeEntry.availableCommands,
      updatedAt: new Date().toISOString(),
    });
    presetAcpSessionId = input.acpSessionId;
  }

  const session = new AcpSession({
    fylloSessionId: input.sessionId,
    agentId,
    workspaceId: input.workspaceId,
    projectPath: workspaceSnapshot.cwd,
    cwd: workspaceSnapshot.cwd,
    additionalDirectories: workspaceSnapshot.additionalDirectories,
    workspaceSnapshot,
    sessionMode,
    owner: "chat",
    sessionStore: new ChatAcpSessionStore(input.workspaceId, input.sessionId, agentId),
    userMessageId: input.userMessageId,
    reminderContext: { taskRef: meta.originTaskRef, taskTitle },
    onReminderInjected: async (reminderPart) => {
      await prependReminderToLastUserMessage(
        sessionMessagesPath(input.workspaceId, input.sessionId),
        reminderPart
      );
    },
    recoveryContext: {
      hasPersistedHistory: true,
      loadPersistedHistory: async () => loadMessages(input.workspaceId, input.sessionId),
    },
    ...(presetAcpSessionId ? { presetAcpSessionId } : {}),
  });

  let sessionMetaPersist = Promise.resolve();
  const enqueueMeta = (
    update: Parameters<typeof patchSessionMeta>[2],
    failureMessage: string
  ): void => {
    sessionMetaPersist = sessionMetaPersist
      .then(async () => {
        const nextMeta = await patchSessionMeta(input.workspaceId, input.sessionId, update);
        if (!nextMeta) logger.warn(`[chat] skipped missing session meta: ${input.sessionId}`);
      })
      .catch((error: unknown) => logger.error(failureMessage, error));
  };

  return {
    session,
    agentId,
    enqueueControlEvent: (event, output) => {
      const chunk = toMessageChunk(event);
      if (chunk) output?.sendChunk(chunk);
      switch (event.kind) {
        case "usage_update":
          enqueueMeta(
            {
              tokenUsage: { used: event.used, size: event.size, cost: event.cost },
              updatedAt: new Date().toISOString(),
            },
            "[chat] failed to persist session usage update"
          );
          break;
        case "available_commands_update":
          enqueueMeta(
            { available_commands: event.commands, updatedAt: new Date().toISOString() },
            "[chat] failed to persist session available commands update"
          );
          break;
        case "config_options_update":
          enqueueMeta(
            { configOptions: event.options, updatedAt: new Date().toISOString() },
            "[chat] failed to persist session config options update"
          );
          break;
        case "session_info_update":
          enqueueMeta(
            { title: event.title, updatedAt: new Date().toISOString() },
            "[chat] failed to persist session title update"
          );
          break;
        default:
          break;
      }
    },
    settleMeta: async (totalTokens) => {
      await sessionMetaPersist;
      await patchSessionMeta(input.workspaceId, input.sessionId, (currentMeta) => ({
        tokenUsage: {
          used: currentMeta.tokenUsage.used + totalTokens,
          size: currentMeta.tokenUsage.size,
          cost: currentMeta.tokenUsage.cost,
        },
        updatedAt: new Date().toISOString(),
      }));
    },
  };
}

function holdLease(runner: AcpTurnRunner, lease: ChatTurnLease): AcpTurnRunner {
  void runner.completion.finally(() => lease.release());
  return {
    ...runner,
    start: async () => {
      try {
        await runner.start();
      } catch (error) {
        runner.cancel();
        throw error;
      }
    },
  };
}

export async function createRendererChatTurn(
  input: RendererChatTurnInput,
  output: StreamOutput
): Promise<AcpTurnRunner> {
  const lease = chatTurnGate.tryAcquire(input.workspaceId, input.sessionId, "user");
  if (!lease)
    throw chatError(IpcErrorCodes.VALIDATION_ERROR, "Chat Session already has an active turn");
  try {
    const prepared = await prepareChatTurn(input);
    const runner = driveAcpStream({
      session: prepared.session,
      owner: "chat",
      registryKey: `${input.workspaceId}:${input.sessionId}`,
      messageSessionId: input.sessionId,
      output,
      logTag: "chat",
      runtimeScope: "window",
      start: () => prepared.session.start(input.prompt),
      hooks: {
        persistMessage: (message) => appendMessage(input.workspaceId, input.sessionId, message),
        onTurnMetadata: async (event) => {
          await patchMessageMetadata(input.workspaceId, input.sessionId, event.userMessageId, {
            updatedAt: new Date(event.dispatchedAt),
            ...(event.model === undefined ? {} : { model: event.model }),
            ...(event.effort === undefined ? {} : { effort: event.effort }),
          });
        },
        onControlEvent: (event, sink) => prepared.enqueueControlEvent(event, sink),
        onDone: ({ totalTokens }) => prepared.settleMeta(totalTokens),
      },
    });
    return holdLease(runner, lease);
  } catch (error) {
    lease.release();
    throw error;
  }
}

function notificationMessage(
  record: Pick<SpawnedTurnRecord, "parentSessionId">,
  reminder: string
): UIMessage<MessageMeta> {
  const createdAt = new Date();
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: reminder }],
    metadata: { sessionId: record.parentSessionId, createdAt, updatedAt: createdAt },
  };
}

const silentStreamOutput: StreamOutput = {
  sendChunk: () => undefined,
  sendDone: () => undefined,
  sendError: () => undefined,
};

async function executeNotificationTurn(
  record: SpawnedTurnRecord,
  lease: ChatTurnLease,
  output: StreamOutput
): Promise<AcpTurnRunner> {
  // finalization 失败时 driver 的 completion 仍按原 status resolve（见 acp-stream-driver finish），
  // 因此用本地标记捕获我们自己 persist/settle 的失败，作为 delivered 结算的否决条件。
  let finalizationFailed = false;
  try {
    const reminder = spawnNotificationService.buildReminder(record);
    const message = notificationMessage(record, reminder);
    await appendMessage(record.workspaceId, record.parentSessionId, message);
    const input: RendererChatTurnInput = {
      workspaceId: record.workspaceId,
      sessionId: record.parentSessionId,
      prompt: [{ type: "text", text: reminder }],
      userMessageId: message.id,
    };
    const prepared = await prepareChatTurn(input);
    const runner = driveAcpStream({
      session: prepared.session,
      owner: "chat",
      registryKey: `${record.workspaceId}:${record.parentSessionId}`,
      messageSessionId: record.parentSessionId,
      output,
      logTag: "spawn-notification",
      runtimeScope: "app",
      start: () => prepared.session.start(input.prompt),
      hooks: {
        persistMessage: async (assembled) => {
          try {
            await appendMessage(record.workspaceId, record.parentSessionId, assembled);
          } catch (error) {
            finalizationFailed = true;
            throw error;
          }
        },
        onTurnMetadata: async (event) => {
          await patchMessageMetadata(
            record.workspaceId,
            record.parentSessionId,
            event.userMessageId,
            {
              updatedAt: new Date(event.dispatchedAt),
              ...(event.model === undefined ? {} : { model: event.model }),
              ...(event.effort === undefined ? {} : { effort: event.effort }),
            }
          );
        },
        onControlEvent: (event, sink) => prepared.enqueueControlEvent(event, sink),
        onDone: async ({ totalTokens }) => {
          try {
            await prepared.settleMeta(totalTokens);
          } catch (error) {
            finalizationFailed = true;
            throw error;
          }
        },
      },
    });
    const supervised = holdLease(runner, lease);
    // 投递结算跟随 turn 终态：completion 在 finalization settle 后才 resolve。
    // start() 由 stream channel 在 renderer ready 握手后触发，这里只挂结算。
    void supervised.completion.then(async (completion: AcpTurnCompletion) => {
      try {
        if (completion.status === "done" && !finalizationFailed) {
          await spawnNotificationService.markDelivered(record);
        } else {
          await spawnNotificationService.markDeliveryUnknown(record);
        }
      } catch (error) {
        logger.error("[spawn-notification] failed to settle notification delivery state", error);
      }
    });
    return supervised;
  } catch (error) {
    lease.release();
    await spawnNotificationService.markDeliveryUnknown(record).catch(() => undefined);
    logger.error("[spawn-notification] automatic parent Chat turn failed", error);
    throw error;
  }
}

export type SpawnNotificationTurnClaim =
  | { status: "not_pending" | "busy" }
  | {
      status: "accepted";
      /** 由 stream channel 的 onReady 调用；返回的 runner 交给 channel 启动与取消。 */
      start: (output: StreamOutput) => Promise<AcpTurnRunner>;
      /** claim 已完成但通道建立失败时调用：释放 lease 并按投递语义记 delivery_unknown。 */
      abort: () => Promise<void>;
    };

export async function claimSpawnNotificationTurn(
  workspaceId: string,
  notificationId: string
): Promise<SpawnNotificationTurnClaim> {
  const summary = (await spawnNotificationService.list(workspaceId)).find(
    (item) => item.notificationId === notificationId
  );
  if (!summary) return { status: "not_pending" };
  const lease = chatTurnGate.tryAcquire(workspaceId, summary.parentSessionId, "notification");
  if (!lease) return { status: "busy" };
  const record = await spawnNotificationService.claim(workspaceId, notificationId);
  if (!record) {
    lease.release();
    return { status: "not_pending" };
  }
  return {
    status: "accepted",
    start: (output) => executeNotificationTurn(record, lease, output),
    abort: async () => {
      lease.release();
      await spawnNotificationService.markDeliveryUnknown(record).catch(() => undefined);
    },
  };
}

export async function executeWorkflowDecisionTurn(
  record: WorkflowDecisionRecord,
  lease: ChatTurnLease,
  output: StreamOutput
): Promise<AcpTurnRunner> {
  let finalizationFailed = false;
  try {
    const reminder = workflowDecisionService.buildReminder(record);
    const message = notificationMessage(record, reminder);
    await appendMessage(record.workspaceId, record.parentSessionId, message);
    const input: RendererChatTurnInput = {
      workspaceId: record.workspaceId,
      sessionId: record.parentSessionId,
      prompt: [{ type: "text", text: reminder }],
      userMessageId: message.id,
    };
    const prepared = await prepareChatTurn(input);
    const runner = driveAcpStream({
      session: prepared.session,
      owner: "chat",
      registryKey: `${record.workspaceId}:${record.parentSessionId}`,
      messageSessionId: record.parentSessionId,
      output,
      logTag: "workflow-decision",
      runtimeScope: "app",
      start: () => prepared.session.start(input.prompt),
      hooks: {
        persistMessage: async (assembled) => {
          try {
            await appendMessage(record.workspaceId, record.parentSessionId, assembled);
          } catch (error) {
            finalizationFailed = true;
            throw error;
          }
        },
        onTurnMetadata: async (event) => {
          await patchMessageMetadata(
            record.workspaceId,
            record.parentSessionId,
            event.userMessageId,
            {
              updatedAt: new Date(event.dispatchedAt),
              ...(event.model === undefined ? {} : { model: event.model }),
              ...(event.effort === undefined ? {} : { effort: event.effort }),
            }
          );
        },
        onControlEvent: (event, sink) => prepared.enqueueControlEvent(event, sink),
        onDone: async ({ totalTokens }) => {
          try {
            await prepared.settleMeta(totalTokens);
          } catch (error) {
            finalizationFailed = true;
            throw error;
          }
        },
      },
    });
    const supervised = holdLease(runner, lease);
    void supervised.completion.then(async (completion: AcpTurnCompletion) => {
      try {
        if (completion.status === "done" && !finalizationFailed) {
          await workflowDecisionService.markDelivered(record);
        } else {
          await workflowDecisionService.markDeliveryUnknown(record);
        }
      } catch (error) {
        logger.error("[workflow-decision] failed to settle notification delivery state", error);
      }
    });
    return supervised;
  } catch (error) {
    lease.release();
    await workflowDecisionService.markDeliveryUnknown(record).catch(() => undefined);
    logger.error("[workflow-decision] automatic parent Chat turn failed", error);
    throw error;
  }
}

export type WorkflowDecisionTurnClaim =
  | { status: "not_pending" | "busy" }
  | {
      status: "accepted";
      start: (output: StreamOutput) => Promise<AcpTurnRunner>;
      abort: () => Promise<void>;
    };

export async function claimWorkflowDecisionTurn(
  workspaceId: string,
  notificationId: string
): Promise<WorkflowDecisionTurnClaim> {
  const summary = (await workflowDecisionService.list(workspaceId)).find(
    (item) => item.notificationId === notificationId
  );
  if (!summary) return { status: "not_pending" };
  const lease = chatTurnGate.tryAcquire(workspaceId, summary.parentSessionId, "notification");
  if (!lease) return { status: "busy" };
  const record = await workflowDecisionService.claim(workspaceId, notificationId);
  if (!record) {
    lease.release();
    return { status: "not_pending" };
  }
  return {
    status: "accepted",
    start: (output) => executeWorkflowDecisionTurn(record, lease, output),
    abort: async () => {
      lease.release();
      await workflowDecisionService.markDeliveryUnknown(record).catch(() => undefined);
    },
  };
}

export type WorkflowConfirmHandoffClaim =
  | { status: "busy" }
  | {
      status: "accepted";
      /** 在 stream channel 的 onReady 中构造 runner，ready 握手后才启动。 */
      start: (output: StreamOutput) => Promise<AcpTurnRunner>;
      /** 通道建立失败或未启动时释放本次 handoff lease。 */
      abort: () => Promise<void>;
    };

export async function claimWorkflowConfirmHandoff(
  record: WorkflowProposalRecord,
  workflowId: string,
  persist: WorkflowProposalPersist
): Promise<WorkflowConfirmHandoffClaim> {
  const lease = chatTurnGate.tryAcquire(
    record.meta.workspaceId,
    record.meta.parentSessionId,
    "notification"
  );
  if (!lease) return { status: "busy" };

  const reminder = [
    "<system-reminder>",
    "Workflow 提案已确认并保存。",
    `workflowId=${workflowId}`,
    `persist=${persist}`,
    "如需执行该 Workflow，必须由 Chat 明确调用 trigger_workflow；保存本身不会启动 Run。",
    "这是一条不可见的状态提醒，不会授予新的文件、网络、命令或跨 Workspace 权限。",
    "</system-reminder>",
  ].join("\n");

  try {
    const message = notificationMessage(record.meta, reminder);
    await appendMessage(record.meta.workspaceId, record.meta.parentSessionId, message);
    const input: RendererChatTurnInput = {
      workspaceId: record.meta.workspaceId,
      sessionId: record.meta.parentSessionId,
      prompt: [{ type: "text", text: reminder }],
      userMessageId: message.id,
    };
    const prepared = await prepareChatTurn(input);
    let runner: AcpTurnRunner | null = null;
    let startPromise: Promise<AcpTurnRunner> | null = null;
    let aborted = false;
    let leaseReleased = false;
    let runnerCancelled = false;
    const releaseLease = (): void => {
      if (leaseReleased) return;
      leaseReleased = true;
      lease.release();
    };
    const cancelRunner = (target: AcpTurnRunner | null): void => {
      if (!target || runnerCancelled) return;
      runnerCancelled = true;
      target.cancel();
    };
    return {
      status: "accepted",
      start: async (output) => {
        if (aborted) {
          throw chatError(
            IpcErrorCodes.WORKFLOW_PROPOSAL_INVALID_STATE,
            "Workflow confirmation handoff was aborted"
          );
        }
        if (runner) return runner;
        if (startPromise) return startPromise;

        startPromise = (async () => {
          try {
            const created = driveAcpStream({
              session: prepared.session,
              owner: "chat",
              registryKey: `${record.meta.workspaceId}:${record.meta.parentSessionId}`,
              messageSessionId: record.meta.parentSessionId,
              output,
              logTag: "workflow-confirm-handoff",
              runtimeScope: "app",
              start: () => prepared.session.start(input.prompt),
              hooks: {
                persistMessage: (assembled) =>
                  appendMessage(record.meta.workspaceId, record.meta.parentSessionId, assembled),
                onTurnMetadata: async (event) => {
                  await patchMessageMetadata(
                    record.meta.workspaceId,
                    record.meta.parentSessionId,
                    event.userMessageId,
                    {
                      updatedAt: new Date(event.dispatchedAt),
                      ...(event.model === undefined ? {} : { model: event.model }),
                      ...(event.effort === undefined ? {} : { effort: event.effort }),
                    }
                  );
                },
                onControlEvent: (event, sink) => prepared.enqueueControlEvent(event, sink),
                onDone: ({ totalTokens }) => prepared.settleMeta(totalTokens),
              },
            });
            if (aborted) {
              cancelRunner(created);
              throw chatError(
                IpcErrorCodes.WORKFLOW_PROPOSAL_INVALID_STATE,
                "Workflow confirmation handoff was aborted"
              );
            }
            runner = holdLease(created, lease);
            return runner;
          } catch (error) {
            releaseLease();
            throw error;
          }
        })();
        return startPromise;
      },
      abort: async () => {
        if (aborted) return;
        aborted = true;
        releaseLease();
        if (runner) {
          cancelRunner(runner);
          return;
        }
        await startPromise?.then(cancelRunner, () => undefined);
      },
    };
  } catch (error) {
    lease.release();
    logger.warn("[workflow-confirm-handoff] failed to prepare parent Chat turn", error);
    throw error;
  }
}

export async function sendWorkflowConfirmHandoff(
  record: WorkflowProposalRecord,
  workflowId: string,
  persist: WorkflowProposalPersist
): Promise<boolean> {
  let claim: WorkflowConfirmHandoffClaim | null = null;
  try {
    claim = await claimWorkflowConfirmHandoff(record, workflowId, persist);
    if (claim.status !== "accepted") return false;
    const runner = await claim.start(silentStreamOutput);
    void runner.start().catch((error: unknown) => {
      logger.warn("[workflow-confirm-handoff] automatic parent Chat turn failed", error);
    });
    return true;
  } catch (error) {
    if (claim?.status === "accepted") {
      await claim.abort().catch(() => undefined);
    }
    logger.warn("[workflow-confirm-handoff] failed to prepare parent Chat turn", error);
    return false;
  }
}
