import { ipcMain } from "electron";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";
import {
  archiveCancelInputSchema,
  archiveInputSchema,
  loadArchiveInputSchema,
  loadArchiveMessagesInputSchema,
} from "@shared/ipc/proposal/archive.schemas";
import type { ArchiveRunMeta } from "@shared/types/proposal";
import { newArchiveFylloSessionId, newArchiveRunId } from "@main/infra/ids";
import {
  appendArchiveMessage,
  archiveMessagesPath,
  loadArchiveMessages,
  loadArchiveRunMeta,
  loadApplyRunMeta,
  saveArchiveRunMeta,
} from "@main/infra/storage/apply-run-store";
import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { AcpSession, driveAcpStream, sessionRegistry } from "@main/services/session/_public";
import {
  buildArchiveStage,
  getCompletedApplyStageIndex,
  resolveApplyRunChangeId,
  resolveWorkspaceCwd,
} from "@main/services/proposal/runtime/apply-run-service";
import { buildStagePrompt } from "@main/services/proposal/runtime/stage-prompts";
import { ipcError } from "../_kit/errors";
import { validate } from "../_kit/schema";
import { makeStreamChannel } from "../_kit/stream-channel";
import { wrapHandler } from "../_kit/wrap-handler";
import { applyRunPersistError, buildProposalRunUserMessage } from "./runtime";

// Archive uses the last completed apply stage's agent to generate the final archive commit.
export function registerProposalArchiveHandlers(): void {
  ipcMain.handle(ProposalArchiveChannels.archive, (event, input: unknown) => {
    const form = validate(archiveInputSchema, input);
    const sessionKey = `${form.workspaceId}:${form.changeId}`;

    return makeStreamChannel({
      event,
      portChannel: ProposalArchiveChannels.archivePort,
      logTag: "proposal-archive",
      onReady: async (sink) => {
        const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
        const runMeta = await loadApplyRunMeta(form.workspaceId, form.changeId);
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
          projectPath: workspaceCwd,
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
        const userMessage = buildProposalRunUserMessage(fylloSessionId, prompt);
        const sessionStore = new ArchiveAcpSessionStore(form.workspaceId, form.changeId);
        const persistArchiveStatus = async (status: ArchiveRunMeta["status"]): Promise<void> => {
          const current = await loadArchiveRunMeta(form.workspaceId, form.changeId);
          await saveArchiveRunMeta(form.workspaceId, {
            ...(current ?? archiveMeta),
            status,
            updatedAt: new Date().toISOString(),
          });
        };

        try {
          await saveArchiveRunMeta(form.workspaceId, archiveMeta);
          await appendArchiveMessage(form.workspaceId, form.changeId, userMessage);
        } catch (error: unknown) {
          throw applyRunPersistError(error);
        }

        sink.sendChunk({ kind: "user_message", message: userMessage });

        const session = new AcpSession({
          fylloSessionId,
          agentId,
          workspaceId: form.workspaceId,
          projectPath: workspaceCwd,
          cwd: runMeta.worktreePath ?? workspaceCwd,
          additionalDirectories: [],
          owner: "archive",
          sessionStore,
          reminderContext: {
            changeId: form.changeId,
            runId: archiveRunId,
            worktreePath: runMeta.worktreePath,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              archiveMessagesPath(form.workspaceId, form.changeId),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () => loadArchiveMessages(form.workspaceId, form.changeId),
          },
        });

        return driveAcpStream({
          session,
          owner: "archive",
          registryKey: sessionKey,
          messageSessionId: fylloSessionId,
          output: sink,
          logTag: "proposal-archive",
          start: () => session.start([{ type: "text", text: prompt }]),
          hooks: {
            persistMessage: (message) =>
              appendArchiveMessage(form.workspaceId, form.changeId, message),
            // archive forwards no control events (parity with apply).
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: () => persistArchiveStatus("done"),
            onError: () => persistArchiveStatus("error"),
          },
        });
      },
    });
  });

  ipcMain.handle(ProposalArchiveChannels.archiveCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(archiveCancelInputSchema, input);
      const sessionKey = `${form.workspaceId}:${form.changeId}`;
      sessionRegistry.cancel("archive", sessionKey);
    })
  );

  ipcMain.handle(ProposalArchiveChannels.loadArchive, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveInputSchema, input);
      const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
      const applyRunChangeId = await resolveApplyRunChangeId(workspaceCwd, form.changeId);
      return loadArchiveRunMeta(form.workspaceId, applyRunChangeId);
    })
  );

  ipcMain.handle(ProposalArchiveChannels.loadArchiveMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveMessagesInputSchema, input);
      const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
      const applyRunChangeId = await resolveApplyRunChangeId(workspaceCwd, form.changeId);
      return loadArchiveMessages(form.workspaceId, applyRunChangeId);
    })
  );
}
