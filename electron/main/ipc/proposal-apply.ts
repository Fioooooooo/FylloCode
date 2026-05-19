import { ipcMain } from "electron";
import { generateId, type UIMessage } from "ai";
import { ProposalChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import {
  applyInputSchema,
  archiveCancelInputSchema,
  archiveInputSchema,
  loadArchiveInputSchema,
  loadArchiveMessagesInputSchema,
  loadRunInputSchema,
  loadRunMessagesInputSchema,
  stageStreamCancelInputSchema,
  stageStreamInputSchema,
} from "@shared/schemas/ipc/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { ArchiveRunMeta } from "@shared/types/proposal";
import type { SessionEvent } from "@main/domain/chat/session-events";
import { AcpSession } from "@main/services/chat/acp-session";
import { sessionRegistry } from "@main/services/chat/session-registry";
import { MessageAssembler } from "@main/services/chat/message-assembler";
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import {
  appendArchiveMessage,
  appendApplyRunMessage,
  archiveMessagesPath,
  loadArchiveMessages,
  loadArchiveRunMeta,
  loadApplyRunMessages,
  loadApplyRunMeta,
  saveArchiveRunMeta,
  stageMessagesPath,
} from "@main/infra/storage/apply-run-store";
import { buildStagePrompt } from "@main/services/proposal/stage-prompts";
import {
  buildArchiveStage,
  createApplyRun,
  getCompletedApplyStageIndex,
  resolveApplyRunChangeId,
  resolveProjectPath,
  updateRunMetaIfCurrent,
} from "@main/services/proposal/apply-run-service";
import { newArchiveFylloSessionId, newStageFylloSessionId } from "@main/infra/ids";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { makeStreamChannel } from "./_kit/stream-channel";
import logger from "@main/infra/logger";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";

function mapAcpErrorCode(raw: string): IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  return IpcErrorCodes.ACP_ERROR;
}

function buildUserMessage(sessionId: string, text: string): UIMessage<MessageMeta> {
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: { sessionId, createdAt: new Date() },
  };
}

function persistError(error: unknown): Error {
  return ipcError(
    IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
    error instanceof Error ? error.message : String(error)
  );
}

export function registerProposalApplyHandlers(): void {
  ipcMain.handle(ProposalChannels.apply, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(applyInputSchema, input);
      return createApplyRun(form);
    })
  );

  ipcMain.handle(ProposalChannels.stageStream, (event, input: unknown) => {
    const form = validate(stageStreamInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ProposalChannels.stageStreamPort,
      logTag: "proposal-apply",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(form.projectId);
        const runMeta = await loadApplyRunMeta(projectPath, form.changeId);
        if (!runMeta || runMeta.runId !== form.runId) {
          throw ipcError(IpcErrorCodes.APPLY_RUN_NOT_FOUND, `Apply run not found: ${form.runId}`);
        }

        const stage = runMeta.stages[form.stageIndex];
        if (!stage) {
          throw ipcError(IpcErrorCodes.STAGE_NOT_FOUND, `Stage not found: ${form.stageIndex}`);
        }

        const prompt = buildStagePrompt({ changeId: form.changeId, projectPath, stage });
        if (!stage.agent) {
          throw ipcError(
            IpcErrorCodes.VALIDATION_ERROR,
            `stage.agent is required for stage ${form.stageIndex}`
          );
        }
        const agentId = stage.agent;
        const fylloSessionId = newStageFylloSessionId(form.runId, form.stageIndex);
        const userMessage = buildUserMessage(fylloSessionId, prompt);
        try {
          await appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, userMessage);
        } catch (error: unknown) {
          throw persistError(error);
        }
        sink.sendChunk({ kind: "user_message", message: userMessage });

        const assembler = new MessageAssembler(fylloSessionId);
        const sessionStore = new ApplyStageAcpSessionStore(
          projectPath,
          form.changeId,
          form.runId,
          form.stageIndex
        );
        const session = new AcpSession({
          fylloSessionId,
          agentId,
          projectPath,
          cwd: runMeta.worktreePath ?? projectPath,
          owner: "apply",
          sessionStore,
          reminderContext: {
            changeId: form.changeId,
            stageIndex: form.stageIndex,
            runId: form.runId,
            worktreePath: runMeta.worktreePath,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              stageMessagesPath(projectPath, form.changeId, form.stageIndex),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () =>
              loadApplyRunMessages(projectPath, form.changeId, form.stageIndex),
          },
        });

        sessionRegistry.register("apply", form.runId, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "session_id_resolved":
              break;
            case "text_delta":
            case "reasoning_delta":
            case "tool_call_start":
            case "tool_call_update": {
              assembler.apply(ev);
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "available_commands_update":
              break;
            case "session_info_update":
            case "usage_update":
              break;
            case "done":
              void (async () => {
                const message = assembler.flush();
                if (message) {
                  await appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, message);
                }

                await updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => {
                  const nextIndex = form.stageIndex + 1;
                  return {
                    ...meta,
                    currentStageIndex: nextIndex,
                    status: nextIndex >= meta.stages.length ? "done" : "running",
                    updatedAt: new Date().toISOString(),
                  };
                });

                sink.sendDone(ev.totalTokens);
                sessionRegistry.unregister("apply", form.runId);
              })().catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist completed message", error);
                sink.sendError(
                  IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
                  error instanceof Error ? error.message : String(error)
                );
                sessionRegistry.unregister("apply", form.runId);
              });
              break;
            case "error":
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                status: "error",
                updatedAt: new Date().toISOString(),
              })).catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist run error status", error);
              });
              sink.sendError(mapAcpErrorCode(ev.code), ev.message);
              sessionRegistry.unregister("apply", form.runId);
              break;
            default: {
              const _exhaustive: never = ev;
              void _exhaustive;
              throw new Error(`unhandled session event: ${(ev as SessionEvent).type}`);
            }
          }
        });

        return {
          start: async () => {
            try {
              await session.start(prompt);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                status: "error",
                updatedAt: new Date().toISOString(),
              })).catch((persistError: unknown) => {
                logger.error("[proposal-apply] failed to persist start error status", persistError);
              });
              throw ipcError(IpcErrorCodes.ACP_ERROR, message);
            }
          },
          cancel: () => {
            session.cancel();
            sessionRegistry.unregister("apply", form.runId);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.stageStreamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { runId } = validate(stageStreamCancelInputSchema, input);
      sessionRegistry.cancel("apply", runId);
    })
  );

  ipcMain.handle(ProposalChannels.archive, (event, input: unknown) => {
    const form = validate(archiveInputSchema, input);
    const sessionKey = `${form.projectId}:${form.changeId}`;

    return makeStreamChannel({
      event,
      portChannel: ProposalChannels.archivePort,
      logTag: "proposal-archive",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(form.projectId);
        const runMeta = await loadApplyRunMeta(projectPath, form.changeId);
        if (!runMeta || runMeta.status !== "done") {
          throw ipcError(
            IpcErrorCodes.APPLY_RUN_NOT_READY,
            `Apply run not ready: ${form.changeId}`
          );
        }

        const completedStageIndex = getCompletedApplyStageIndex(runMeta);
        if (completedStageIndex < 0) {
          throw ipcError(
            IpcErrorCodes.APPLY_RUN_NOT_READY,
            `Apply run not ready: ${form.changeId}`
          );
        }

        const agentId = runMeta.stages[completedStageIndex]?.agent;
        if (!agentId) {
          throw ipcError(
            IpcErrorCodes.VALIDATION_ERROR,
            `stage.agent is required for stage ${completedStageIndex}`
          );
        }

        if (!runMeta.stageAcpSessionIds[completedStageIndex]) {
          throw ipcError(
            IpcErrorCodes.APPLY_SESSION_NOT_READY,
            `Apply session not ready for archive: ${form.changeId}`
          );
        }

        const fylloSessionId = newArchiveFylloSessionId(runMeta.runId);
        const stage = buildArchiveStage(agentId);
        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath,
          stage,
        });
        const archiveRunId = `archive-${Date.now()}`;
        const startedAt = new Date().toISOString();
        const archiveMeta: ArchiveRunMeta = {
          runId: archiveRunId,
          changeId: form.changeId,
          status: "running",
          startedAt,
          updatedAt: startedAt,
        };
        const userMessage = buildUserMessage(fylloSessionId, prompt);
        const sessionStore = new ArchiveAcpSessionStore(projectPath, form.changeId);
        const persistArchiveStatus = async (status: ArchiveRunMeta["status"]): Promise<void> => {
          const current = await loadArchiveRunMeta(projectPath, form.changeId);
          await saveArchiveRunMeta(projectPath, {
            ...(current ?? archiveMeta),
            status,
            updatedAt: new Date().toISOString(),
          });
        };

        try {
          await saveArchiveRunMeta(projectPath, archiveMeta);
          await appendArchiveMessage(projectPath, form.changeId, userMessage);
        } catch (error: unknown) {
          throw persistError(error);
        }

        sink.sendChunk({ kind: "user_message", message: userMessage });
        const assembler = new MessageAssembler(fylloSessionId);

        const session = new AcpSession({
          fylloSessionId,
          agentId,
          projectPath,
          cwd: runMeta.worktreePath ?? projectPath,
          owner: "archive",
          sessionStore,
          reminderContext: {
            changeId: form.changeId,
            runId: archiveRunId,
            worktreePath: runMeta.worktreePath,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              archiveMessagesPath(projectPath, form.changeId),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () => loadArchiveMessages(projectPath, form.changeId),
          },
        });
        sessionRegistry.register("archive", sessionKey, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "text_delta":
            case "reasoning_delta":
            case "tool_call_start":
            case "tool_call_update": {
              assembler.apply(ev);
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "available_commands_update":
              break;
            case "session_info_update": {
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "done":
              void (async () => {
                const message = assembler.flush();
                if (message) {
                  await appendArchiveMessage(projectPath, form.changeId, message);
                }
                await persistArchiveStatus("done");
                sink.sendDone(ev.totalTokens);
                sessionRegistry.unregister("archive", sessionKey);
              })().catch((error: unknown) => {
                logger.error(
                  "[proposal-archive] failed to persist completed archive message",
                  error
                );
                sink.sendError(
                  IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
                  error instanceof Error ? error.message : String(error)
                );
                sessionRegistry.unregister("archive", sessionKey);
              });
              break;
            case "error":
              void (async () => {
                await persistArchiveStatus("error");
                sink.sendError(mapAcpErrorCode(ev.code), ev.message);
                sessionRegistry.unregister("archive", sessionKey);
              })().catch((error: unknown) => {
                logger.error("[proposal-archive] failed to persist archive error status", error);
                sink.sendError(mapAcpErrorCode(ev.code), ev.message);
                sessionRegistry.unregister("archive", sessionKey);
              });
              break;
            case "session_id_resolved":
            case "usage_update":
              break;
            default: {
              const _exhaustive: never = ev;
              void _exhaustive;
              throw new Error(`unhandled session event: ${(ev as SessionEvent).type}`);
            }
          }
        });

        return {
          start: async () => {
            await session.start(prompt);
          },
          cancel: () => {
            session.cancel();
            sessionRegistry.unregister("archive", sessionKey);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.archiveCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(archiveCancelInputSchema, input);
      const sessionKey = `${form.projectId}:${form.changeId}`;
      sessionRegistry.cancel("archive", sessionKey);
    })
  );

  ipcMain.handle(ProposalChannels.loadRun, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadApplyRunMeta(projectPath, applyRunChangeId);
    })
  );

  ipcMain.handle(ProposalChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadApplyRunMessages(projectPath, applyRunChangeId, form.stageIndex);
    })
  );

  ipcMain.handle(ProposalChannels.loadArchive, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadArchiveRunMeta(projectPath, applyRunChangeId);
    })
  );

  ipcMain.handle(ProposalChannels.loadArchiveMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadArchiveMessages(projectPath, applyRunChangeId);
    })
  );
}
