import { ipcMain } from "electron";
import { generateId, type UIMessage } from "ai";
import { ProposalChannels } from "@shared/types/channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
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
import { AcpSession } from "@main/services/chat/acp-session";
import { sessionRegistry } from "@main/services/chat/session-registry";
import { driveAcpStream } from "@main/services/chat/acp-stream-driver";
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
import { newArchiveFylloSessionId, newArchiveRunId, newStageFylloSessionId } from "@main/infra/ids";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { makeStreamChannel } from "./_kit/stream-channel";
import logger from "@main/infra/logger";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";

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

        return driveAcpStream({
          session,
          owner: "apply",
          registryKey: form.runId,
          output: sink,
          logTag: "proposal-apply",
          start: async () => {
            try {
              await session.start([{ type: "text", text: prompt }]);
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
          hooks: {
            persistMessage: (message) =>
              appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, message),
            // apply forwards no control events.
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: async () => {
              await updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => {
                const nextIndex = form.stageIndex + 1;
                return {
                  ...meta,
                  currentStageIndex: nextIndex,
                  status: nextIndex >= meta.stages.length ? "done" : "running",
                  updatedAt: new Date().toISOString(),
                };
              });
            },
            onError: async () => {
              await updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                status: "error",
                updatedAt: new Date().toISOString(),
              }));
            },
          },
        });
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
        const archiveRunId = newArchiveRunId();
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

        return driveAcpStream({
          session,
          owner: "archive",
          registryKey: sessionKey,
          output: sink,
          logTag: "proposal-archive",
          start: () => session.start([{ type: "text", text: prompt }]),
          hooks: {
            persistMessage: (message) => appendArchiveMessage(projectPath, form.changeId, message),
            // archive forwards no control events (parity with apply).
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: () => persistArchiveStatus("done"),
            onError: () => persistArchiveStatus("error"),
          },
        });
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
