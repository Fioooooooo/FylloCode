import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { DEFAULT_ACP_AGENT_ID } from "@shared/constants/agents";
import type { IpcErrorCode } from "@shared/constants/error-codes";
import {
  applyInputSchema,
  archiveCancelInputSchema,
  archiveInputSchema,
  loadRunInputSchema,
  loadRunMessagesInputSchema,
  stageStreamCancelInputSchema,
  stageStreamInputSchema,
} from "@shared/schemas/ipc/proposal";
import type { SessionEvent } from "@main/domain/chat/session-events";
import { AcpSession } from "@main/services/chat/acp-session";
import { MessageAssembler } from "@main/domain/chat/message-assembler";
import { loadSessionMeta } from "@main/infra/storage/session-store";
import { toMessageChunk } from "@main/services/chat/session-event-mapper";
import {
  appendApplyRunMessage,
  loadApplyRunMessages,
  loadApplyRunMeta,
} from "@main/infra/storage/apply-run-store";
import { buildStagePrompt } from "@main/services/proposal/stage-prompts";
import {
  buildArchiveStage,
  createApplyRun,
  getCompletedApplyStageIndex,
  resolveProjectPath,
  updateRunMetaIfCurrent,
} from "@main/services/proposal/apply-run-service";
import { newStageFylloSessionId } from "@main/infra/ids";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { makeStreamChannel } from "./_kit/stream-channel";
import logger from "@main/infra/logger";

const activeApplySessions = new Map<string, AcpSession>();
const activeArchiveSessions = new Map<string, AcpSession>();

function mapAcpErrorCode(raw: string): IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  return IpcErrorCodes.ACP_ERROR;
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
        const agentId = stage.agent ?? DEFAULT_ACP_AGENT_ID;
        const assembler = new MessageAssembler(form.runId);
        const session = new AcpSession({
          fylloSessionId: newStageFylloSessionId(form.runId, form.stageIndex),
          agentId,
          projectPath,
          cwd: projectPath,
        });

        activeApplySessions.set(form.runId, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "session_id_resolved":
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                stageAcpSessionIds: {
                  ...meta.stageAcpSessionIds,
                  [form.stageIndex]: ev.acpSessionId,
                },
                updatedAt: new Date().toISOString(),
              })).catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist acp session id", error);
              });
              break;
            case "text_delta":
            case "tool_call_start":
            case "tool_call_update": {
              assembler.apply(ev);
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "session_info_update":
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
                activeApplySessions.delete(form.runId);
              })().catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist completed message", error);
                sink.sendError(
                  IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
                  error instanceof Error ? error.message : String(error)
                );
                activeApplySessions.delete(form.runId);
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
              activeApplySessions.delete(form.runId);
              break;
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
            activeApplySessions.delete(form.runId);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.stageStreamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { runId } = validate(stageStreamCancelInputSchema, input);
      const session = activeApplySessions.get(runId);
      if (!session) return;
      session.cancel();
      activeApplySessions.delete(runId);
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

        const fylloSessionId = newStageFylloSessionId(runMeta.runId, completedStageIndex);
        const sessionMeta = await loadSessionMeta(projectPath, fylloSessionId);
        if (!sessionMeta?.acpSessionId) {
          throw ipcError(
            IpcErrorCodes.APPLY_SESSION_NOT_READY,
            `Apply session not ready for archive: ${form.changeId}`
          );
        }

        const stage = buildArchiveStage(sessionMeta.agentId);
        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath,
          stage,
        });

        const session = new AcpSession({
          fylloSessionId,
          agentId: sessionMeta.agentId,
          projectPath,
          cwd: projectPath,
        });
        activeArchiveSessions.set(sessionKey, session);

        session.on("event", (ev: SessionEvent) => {
          if (
            ev.type === "text_delta" ||
            ev.type === "tool_call_start" ||
            ev.type === "tool_call_update" ||
            ev.type === "session_info_update"
          ) {
            const chunk = toMessageChunk(ev);
            if (chunk) sink.sendChunk(chunk);
            return;
          }

          if (ev.type === "done") {
            sink.sendDone(ev.totalTokens);
            activeArchiveSessions.delete(sessionKey);
            return;
          }

          if (ev.type === "error") {
            sink.sendError(mapAcpErrorCode(ev.code), ev.message);
            activeArchiveSessions.delete(sessionKey);
          }
        });

        return {
          start: async () => {
            await session.start(prompt);
          },
          cancel: () => {
            session.cancel();
            activeArchiveSessions.delete(sessionKey);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.archiveCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(archiveCancelInputSchema, input);
      const sessionKey = `${form.projectId}:${form.changeId}`;
      const session = activeArchiveSessions.get(sessionKey);
      if (!session) return;
      session.cancel();
      activeArchiveSessions.delete(sessionKey);
    })
  );

  ipcMain.handle(ProposalChannels.loadRun, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return loadApplyRunMeta(projectPath, form.changeId);
    })
  );

  ipcMain.handle(ProposalChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return loadApplyRunMessages(projectPath, form.changeId, form.stageIndex);
    })
  );
}
