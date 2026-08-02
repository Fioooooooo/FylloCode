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
  updateRunMetaIfCurrent,
  validateApplyRunTarget,
} from "@main/services/proposal/runtime/apply-run-service";
import { newStageFylloSessionId } from "@main/infra/ids";
import { wrapHandler } from "../_kit/wrap-handler";
import { validate } from "../_kit/schema";
import { ipcError } from "../_kit/errors";
import { makeStreamChannel } from "../_kit/stream-channel";
import logger from "@main/infra/logger";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { ApplyStageAcpSessionStore } from "@main/infra/storage/apply-stage-acp-session-store";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { createOwnerMcpWorkspaceDescriptor } from "@main/services/session/chat/mcp-workspace-descriptor";
import { recordProposalContinuation } from "@main/services/insight/lineage/lineage-service";
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
        const proposalRef = { folderId: form.folderId, changeId: form.changeId };
        const runMeta = await loadApplyRunMeta(form.workspaceId, proposalRef);
        if (!runMeta || runMeta.runId !== form.runId) {
          throw ipcError(IpcErrorCodes.APPLY_RUN_NOT_FOUND, `Apply run not found: ${form.runId}`);
        }

        const repositoryTarget = await validateApplyRunTarget(
          form.workspaceId,
          proposalRef,
          runMeta
        );
        const stage = runMeta.stages[form.stageIndex];
        if (!stage) {
          throw ipcError(IpcErrorCodes.STAGE_NOT_FOUND, `Stage not found: ${form.stageIndex}`);
        }

        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath: repositoryTarget.worktreePath,
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
        const ownerFolder = workspace.folders.find(
          (folder) => folder.folderId === proposalRef.folderId
        );
        if (!ownerFolder || ownerFolder.pathMissing) {
          throw ipcError(
            IpcErrorCodes.PROPOSAL_NOT_FOUND,
            `Proposal owner is no longer available: ${form.changeId}`
          );
        }
        const mcpWorkspaceDescriptor = createOwnerMcpWorkspaceDescriptor({
          workspaceId: form.workspaceId,
          workspaceKind: workspace.kind,
          ownerFolder: {
            folderId: ownerFolder.folderId,
            folderName: ownerFolder.folderName,
            folderPath: ownerFolder.folderPath,
          },
          sessionId: fylloSessionId,
        });
        const continuation = await recordProposalContinuation(
          form.workspaceId,
          fylloSessionId,
          proposalRef
        ).catch((error: unknown) => ({
          status: "failed" as const,
          error: {
            type: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
          },
        }));
        if (continuation.status === "failed" || continuation.status === "conflict") {
          logger.warn("[proposal-apply] failed to record lineage continuation", continuation);
        }
        const userMessage = buildProposalRunUserMessage(fylloSessionId, prompt);
        try {
          await appendApplyRunMessage(form.workspaceId, proposalRef, form.stageIndex, userMessage);
        } catch (error: unknown) {
          throw applyRunPersistError(error);
        }
        sink.sendChunk({ kind: "user_message", message: userMessage });

        const sessionStore = new ApplyStageAcpSessionStore(
          form.workspaceId,
          proposalRef,
          form.runId,
          form.stageIndex
        );
        const session = new AcpSession({
          fylloSessionId,
          agentId,
          workspaceId: form.workspaceId,
          projectPath: repositoryTarget.worktreePath,
          cwd: repositoryTarget.worktreePath,
          additionalDirectories: [],
          mcpWorkspaceDescriptor,
          owner: "apply",
          sessionStore,
          reminderContext: {
            changeId: form.changeId,
            stageIndex: form.stageIndex,
            runId: form.runId,
            worktreePath: repositoryTarget.worktreePath,
            folderId: ownerFolder.folderId,
            folderName: ownerFolder.folderName,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              stageMessagesPath(form.workspaceId, proposalRef, form.stageIndex),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () =>
              loadApplyRunMessages(form.workspaceId, proposalRef, form.stageIndex),
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
              void updateRunMetaIfCurrent(form.workspaceId, proposalRef, form.runId, (meta) => ({
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
              appendApplyRunMessage(form.workspaceId, proposalRef, form.stageIndex, message),
            // apply forwards no control events.
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: async () => {
              await updateRunMetaIfCurrent(form.workspaceId, proposalRef, form.runId, (meta) => {
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
              await updateRunMetaIfCurrent(form.workspaceId, proposalRef, form.runId, (meta) => ({
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
      return loadApplyRunMeta(form.workspaceId, {
        folderId: form.folderId,
        changeId: form.changeId,
      });
    })
  );

  ipcMain.handle(ProposalApplyChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      return loadApplyRunMessages(
        form.workspaceId,
        { folderId: form.folderId, changeId: form.changeId },
        form.stageIndex
      );
    })
  );
}
