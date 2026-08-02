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
  resolveWorkspaceCwd,
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
import {
  getRequiredWorkspaceInfo,
  resolveRepositoryTarget,
} from "@main/services/workspace/_public";
import { createOwnerMcpWorkspaceDescriptor } from "@main/services/session/chat/mcp-workspace-descriptor";
import { applyRunPersistError, buildProposalRunUserMessage } from "./runtime";

export function registerProposalApplyHandlers(): void {
  ipcMain.handle(ProposalApplyChannels.apply, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(applyInputSchema, input);
      return createApplyRun(form);
    })
  );

  // Stage stream: each stage gets its own AcpSession, persisted messages, and run meta update.
  // Recovery uses the persisted stage messages as history so resuming a stage does not lose context.
  ipcMain.handle(ProposalApplyChannels.stageStream, (event, input: unknown) => {
    const form = validate(stageStreamInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ProposalApplyChannels.stageStreamPort,
      logTag: "proposal-apply",
      onReady: async (sink) => {
        const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
        const runMeta = await loadApplyRunMeta(form.workspaceId, form.changeId);
        if (!runMeta || runMeta.runId !== form.runId) {
          throw ipcError(IpcErrorCodes.APPLY_RUN_NOT_FOUND, `Apply run not found: ${form.runId}`);
        }

        const stage = runMeta.stages[form.stageIndex];
        if (!stage) {
          throw ipcError(IpcErrorCodes.STAGE_NOT_FOUND, `Stage not found: ${form.stageIndex}`);
        }

        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath: workspaceCwd,
          stage,
        });
        if (!stage.agent) {
          throw ipcError(
            IpcErrorCodes.VALIDATION_ERROR,
            `stage.agent is required for stage ${form.stageIndex}`
          );
        }
        const agentId = stage.agent;
        const fylloSessionId = newStageFylloSessionId(form.runId, form.stageIndex);
        const workspace = await getRequiredWorkspaceInfo(form.workspaceId);
        const repositoryTarget = await resolveRepositoryTarget({
          workspaceId: form.workspaceId,
          folderId: workspace.primaryFolder.id,
          worktreePath: runMeta.worktreePath ?? workspaceCwd,
        });
        const mcpWorkspaceDescriptor = createOwnerMcpWorkspaceDescriptor({
          workspaceId: form.workspaceId,
          workspaceKind: workspace.kind,
          ownerFolder: {
            folderId: workspace.primaryFolder.id,
            folderName: workspace.primaryFolder.name,
            folderPath: workspaceCwd,
          },
          sessionId: fylloSessionId,
        });
        const userMessage = buildProposalRunUserMessage(fylloSessionId, prompt);
        try {
          await appendApplyRunMessage(
            form.workspaceId,
            form.changeId,
            form.stageIndex,
            userMessage
          );
        } catch (error: unknown) {
          throw applyRunPersistError(error);
        }
        sink.sendChunk({ kind: "user_message", message: userMessage });

        const sessionStore = new ApplyStageAcpSessionStore(
          form.workspaceId,
          form.changeId,
          form.runId,
          form.stageIndex
        );
        const session = new AcpSession({
          fylloSessionId,
          agentId,
          workspaceId: form.workspaceId,
          projectPath: workspaceCwd,
          cwd: repositoryTarget.worktreePath,
          additionalDirectories: [],
          mcpWorkspaceDescriptor,
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
              stageMessagesPath(form.workspaceId, form.changeId, form.stageIndex),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () =>
              loadApplyRunMessages(form.workspaceId, form.changeId, form.stageIndex),
          },
        });

        return driveAcpStream({
          session,
          owner: "apply",
          registryKey: `${form.workspaceId}:${form.runId}`,
          messageSessionId: fylloSessionId,
          output: sink,
          logTag: "proposal-apply",
          start: async () => {
            try {
              await session.start([{ type: "text", text: prompt }]);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              void updateRunMetaIfCurrent(form.workspaceId, form.changeId, form.runId, (meta) => ({
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
              appendApplyRunMessage(form.workspaceId, form.changeId, form.stageIndex, message),
            // apply forwards no control events.
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: async () => {
              await updateRunMetaIfCurrent(form.workspaceId, form.changeId, form.runId, (meta) => {
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
              await updateRunMetaIfCurrent(form.workspaceId, form.changeId, form.runId, (meta) => ({
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
      const { workspaceId, runId } = validate(stageStreamCancelInputSchema, input);
      sessionRegistry.cancel("apply", `${workspaceId}:${runId}`);
    })
  );

  ipcMain.handle(ProposalApplyChannels.loadRun, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunInputSchema, input);
      const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
      const applyRunChangeId = await resolveApplyRunChangeId(workspaceCwd, form.changeId);
      return loadApplyRunMeta(form.workspaceId, applyRunChangeId);
    })
  );

  ipcMain.handle(ProposalApplyChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      const workspaceCwd = await resolveWorkspaceCwd(form.workspaceId);
      const applyRunChangeId = await resolveApplyRunChangeId(workspaceCwd, form.changeId);
      return loadApplyRunMessages(form.workspaceId, applyRunChangeId, form.stageIndex);
    })
  );
}
