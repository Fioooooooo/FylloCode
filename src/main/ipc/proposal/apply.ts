import { ipcMain } from "electron";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  applyInputSchema,
  loadRunInputSchema,
  loadRunMessagesInputSchema,
  stageStreamCancelInputSchema,
  stageStreamInputSchema,
} from "@shared/ipc/proposal/apply.schemas";
import { AcpSession, driveAcpStream, sessionRegistry } from "@main/services/session/_public";
import {
  appendApplyRunMessage,
  loadApplyRunMessages,
  loadApplyRunMeta,
  stageMessagesPath,
} from "@main/infra/storage/apply-run-store";
import { buildStagePrompt } from "@main/services/proposal/runtime/stage-prompts";
import {
  createApplyRun,
  resolveApplyRunChangeId,
  resolveProjectPath,
  updateRunMetaIfCurrent,
} from "@main/services/proposal/runtime/apply-run-service";
import { newStageFylloSessionId } from "@main/infra/ids";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import { ipcError } from "../_kit/errors";
import { makeStreamChannel } from "../_kit/stream-channel";
import logger from "@main/infra/logger";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { applyRunPersistError, buildProposalRunUserMessage } from "./runtime";

export function registerProposalApplyHandlers(): void {
  ipcMain.handle(ProposalApplyChannels.apply, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(applyInputSchema, input);
      return createApplyRun(form);
    })
  );

  ipcMain.handle(ProposalApplyChannels.stageStream, (event, input: unknown) => {
    const form = validate(stageStreamInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ProposalApplyChannels.stageStreamPort,
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
        const userMessage = buildProposalRunUserMessage(fylloSessionId, prompt);
        try {
          await appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, userMessage);
        } catch (error: unknown) {
          throw applyRunPersistError(error);
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
          registryKey: `${form.projectId}:${form.runId}`,
          messageSessionId: fylloSessionId,
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

  ipcMain.handle(ProposalApplyChannels.stageStreamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, runId } = validate(stageStreamCancelInputSchema, input);
      sessionRegistry.cancel("apply", `${projectId}:${runId}`);
    })
  );

  ipcMain.handle(ProposalApplyChannels.loadRun, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadApplyRunMeta(projectPath, applyRunChangeId);
    })
  );

  ipcMain.handle(ProposalApplyChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const applyRunChangeId = await resolveApplyRunChangeId(projectPath, form.changeId);
      return loadApplyRunMessages(projectPath, applyRunChangeId, form.stageIndex);
    })
  );
}
