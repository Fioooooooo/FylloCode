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
  patchArchiveMessageMetadata,
  loadApplyRunMeta,
  saveArchiveRunMeta,
} from "@main/infra/storage/apply-run-store";
import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";
import { AcpSession, driveAcpStream, sessionRegistry } from "@main/services/session/_public";
import {
  buildArchiveStage,
  getCompletedApplyStageIndex,
  validateApplyRunTarget,
} from "@main/services/proposal/runtime/apply-run-service";
import { buildStagePrompt } from "@main/services/proposal/runtime/stage-prompts";
import { ipcError } from "../_kit/errors";
import { validate } from "../_kit/schema";
import { makeStreamChannel } from "../_kit/stream-channel";
import { wrapHandler } from "../_kit/wrap-handler";
import { applyRunPersistError, buildProposalRunUserMessage } from "./runtime";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { createOwnerMcpWorkspaceDescriptor } from "@main/services/session/chat/mcp-workspace-descriptor";
import {
  recordDiscoveredProposalCommit,
  recordProposalContinuation,
} from "@main/services/insight/lineage/lineage-service";
import { buildArchiveCommitIndex } from "@main/services/insight/overview/archive-commit-index";
import logger from "@main/infra/logger";

// Archive uses the last completed apply stage's agent to generate the final archive commit.
export function registerProposalArchiveHandlers(): void {
  ipcMain.handle(ProposalArchiveChannels.archive, (event, input: unknown) => {
    const form = validate(archiveInputSchema, input);
    const proposalRef = { folderId: form.folderId, changeId: form.changeId };
    const sessionKey = `${form.workspaceId}:${form.folderId}:${form.changeId}`;

    return makeStreamChannel({
      event,
      portChannel: ProposalArchiveChannels.archivePort,
      logTag: "proposal-archive",
      onReady: async (sink) => {
        const runMeta = await loadApplyRunMeta(form.workspaceId, proposalRef);
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

        const repositoryTarget = await validateApplyRunTarget(
          form.workspaceId,
          proposalRef,
          runMeta
        );
        const fylloSessionId = newArchiveFylloSessionId(runMeta.runId);
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
          logger.warn("[proposal-archive] failed to record lineage continuation", continuation);
        }
        const stage = buildArchiveStage(agentId);
        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath: repositoryTarget.worktreePath,
          stage,
        });
        const archiveRunId = newArchiveRunId();
        const startedAt = new Date().toISOString();
        const archiveMeta: ArchiveRunMeta = {
          runId: archiveRunId,
          proposalRef,
          worktreePath: repositoryTarget.worktreePath,
          status: "running",
          startedAt,
          updatedAt: startedAt,
        };
        const userMessage = buildProposalRunUserMessage(fylloSessionId, prompt);
        const sessionStore = new ArchiveAcpSessionStore(form.workspaceId, proposalRef);
        const persistArchiveStatus = async (status: ArchiveRunMeta["status"]): Promise<void> => {
          const current = await loadArchiveRunMeta(form.workspaceId, proposalRef);
          await saveArchiveRunMeta(form.workspaceId, {
            ...(current ?? archiveMeta),
            status,
            updatedAt: new Date().toISOString(),
          });
        };

        try {
          await saveArchiveRunMeta(form.workspaceId, archiveMeta);
          await appendArchiveMessage(form.workspaceId, proposalRef, userMessage);
        } catch (error: unknown) {
          throw applyRunPersistError(error);
        }

        sink.sendChunk({ kind: "user_message", message: userMessage });

        const session = new AcpSession({
          fylloSessionId,
          agentId,
          workspaceId: form.workspaceId,
          projectPath: repositoryTarget.worktreePath,
          cwd: repositoryTarget.worktreePath,
          additionalDirectories: [],
          mcpWorkspaceDescriptor,
          owner: "archive",
          sessionStore,
          userMessageId: userMessage.id,
          reminderContext: {
            changeId: form.changeId,
            runId: archiveRunId,
            worktreePath: repositoryTarget.worktreePath,
            folderId: ownerFolder.folderId,
            folderName: ownerFolder.folderName,
          },
          onReminderInjected: async (reminderPart) => {
            await prependReminderToLastUserMessage(
              archiveMessagesPath(form.workspaceId, proposalRef),
              reminderPart
            );
          },
          recoveryContext: {
            hasPersistedHistory: true,
            loadPersistedHistory: async () => loadArchiveMessages(form.workspaceId, proposalRef),
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
              appendArchiveMessage(form.workspaceId, proposalRef, message),
            onTurnMetadata: async (event) => {
              await patchArchiveMessageMetadata(
                form.workspaceId,
                proposalRef,
                event.userMessageId,
                {
                  updatedAt: new Date(event.dispatchedAt),
                  ...(event.model === undefined ? {} : { model: event.model }),
                  ...(event.effort === undefined ? {} : { effort: event.effort }),
                }
              );
            },
            // archive forwards no control events (parity with apply).
            doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
            onDone: async () => {
              await persistArchiveStatus("done");
              const archiveCommit = (
                await buildArchiveCommitIndex(repositoryTarget.worktreePath, [form.changeId])
              ).get(form.changeId);
              if (!archiveCommit) {
                return;
              }
              const result = await recordDiscoveredProposalCommit(
                form.workspaceId,
                proposalRef,
                archiveCommit.hash
              );
              if (result.status === "failed" || result.status === "conflict") {
                logger.warn("[proposal-archive] failed to record archive commit lineage", result);
              }
            },
            onError: () => persistArchiveStatus("error"),
          },
        });
      },
    });
  });

  ipcMain.handle(ProposalArchiveChannels.archiveCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(archiveCancelInputSchema, input);
      const sessionKey = `${form.workspaceId}:${form.folderId}:${form.changeId}`;
      sessionRegistry.cancel("archive", sessionKey);
    })
  );

  ipcMain.handle(ProposalArchiveChannels.loadArchive, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveInputSchema, input);
      return loadArchiveRunMeta(form.workspaceId, {
        folderId: form.folderId,
        changeId: form.changeId,
      });
    })
  );

  ipcMain.handle(ProposalArchiveChannels.loadArchiveMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadArchiveMessagesInputSchema, input);
      return loadArchiveMessages(form.workspaceId, {
        folderId: form.folderId,
        changeId: form.changeId,
      });
    })
  );
}
