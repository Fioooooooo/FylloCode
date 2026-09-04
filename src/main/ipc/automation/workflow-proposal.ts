import { ipcMain } from "electron";
import {
  confirmWorkflowProposalInputSchema,
  dispatchWorkflowProposalConfirmInputSchema,
  getWorkflowProposalDetailInputSchema,
  listWorkflowProposalsInputSchema,
  cancelWorkflowProposalInputSchema,
} from "@shared/ipc/automation/workflow-proposal.schemas";
import { AutomationWorkflowProposalChannels } from "@shared/ipc/automation/workflow-proposal.channels";
import { SessionChatStreamChannels } from "@shared/ipc/session/chat.channels";
import type {
  WorkflowProposalConfirmDispatchResult,
  WorkflowProposalConfirmRequest,
  WorkflowProposalConfirmResult,
  WorkflowProposalDetailRequest,
  WorkflowProposalListRequest,
  WorkflowProposalWakePayload,
} from "@shared/types/workflow";
import {
  workflowProposalService,
  type WorkflowProposalService,
} from "@main/services/automation/workflow/workflow-proposal-service";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { assertSessionBelongsToWorkspace } from "@main/services/session/chat/chat-service";
import { claimWorkflowConfirmHandoff } from "@main/services/session/chat/chat-turn-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";
import { makeStreamChannel, type StreamRunner, type StreamSink } from "../_kit/stream-channel";
import { ipcError } from "../_kit/errors";

export interface WorkflowProposalHandlerService {
  listProposals(
    request: WorkflowProposalListRequest
  ): ReturnType<WorkflowProposalService["listProposals"]>;
  getProposalDetail(
    request: WorkflowProposalDetailRequest
  ): ReturnType<WorkflowProposalService["getProposalDetail"]>;
  confirmProposal(
    request: WorkflowProposalConfirmRequest,
    handoffHandler?: Parameters<WorkflowProposalService["confirmProposal"]>[1]
  ): ReturnType<WorkflowProposalService["confirmProposal"]>;
  cancelProposal(
    request: WorkflowProposalDetailRequest
  ): ReturnType<WorkflowProposalService["cancelProposal"]>;
}

export interface WorkflowProposalWakeDispatcherOptions {
  delayMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export class WorkflowProposalWakeDispatcher {
  private readonly delayMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
    options: WorkflowProposalWakeDispatcherOptions = {}
  ) {
    this.delayMs = options.delayMs ?? 40;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
  }

  notify(payload: WorkflowProposalWakePayload): void {
    if (this.closed) return;
    const key = `${payload.workspaceId}\0${payload.parentSessionId}\0${payload.proposalId}`;
    if (this.timers.has(key)) return;
    const timer = this.setTimer(() => {
      this.timers.delete(key);
      if (this.closed) return;
      this.manager.sendToWorkspace(
        payload.workspaceId,
        AutomationWorkflowProposalChannels.wake,
        payload
      );
    }, this.delayMs);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
  }
}

export function setupWorkflowProposalBroadcast(
  manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
  service: Pick<WorkflowProposalService, "setWakeHandler"> = workflowProposalService,
  options: WorkflowProposalWakeDispatcherOptions = {}
): () => void {
  const dispatcher = new WorkflowProposalWakeDispatcher(manager, options);
  service.setWakeHandler((payload) => dispatcher.notify(payload));
  return () => {
    dispatcher.dispose();
    service.setWakeHandler(null);
  };
}

async function assertWorkflowProposalOwner(
  workspaceId: string,
  parentSessionId: string
): Promise<void> {
  await getRequiredWorkspaceInfo(workspaceId);
  await assertSessionBelongsToWorkspace(workspaceId, parentSessionId);
}

function completedStreamRunner(sink: StreamSink): StreamRunner {
  return {
    start: async () => sink.sendDone(0),
    cancel: () => undefined,
  };
}

export function registerWorkflowProposalHandlers(
  service: WorkflowProposalHandlerService = workflowProposalService
): void {
  ipcMain.handle(AutomationWorkflowProposalChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(listWorkflowProposalsInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowProposalOwner(request.workspaceId, request.parentSessionId);
      return service.listProposals(request);
    })
  );

  ipcMain.handle(AutomationWorkflowProposalChannels.getDetail, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(getWorkflowProposalDetailInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowProposalOwner(request.workspaceId, request.parentSessionId);
      return service.getProposalDetail(request);
    })
  );

  ipcMain.handle(AutomationWorkflowProposalChannels.confirm, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(confirmWorkflowProposalInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowProposalOwner(request.workspaceId, request.parentSessionId);
      return service.confirmProposal(request);
    })
  );

  ipcMain.handle(AutomationWorkflowProposalChannels.confirmDispatch, (event, input: unknown) =>
    wrapHandler(async (): Promise<WorkflowProposalConfirmDispatchResult> => {
      const { streamId, ...request } = validate(dispatchWorkflowProposalConfirmInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowProposalOwner(request.workspaceId, request.parentSessionId);

      let resolveConfirmation!: (result: WorkflowProposalConfirmResult) => void;
      let rejectConfirmation!: (error: unknown) => void;
      const confirmation = new Promise<WorkflowProposalConfirmResult>((resolve, reject) => {
        resolveConfirmation = resolve;
        rejectConfirmation = reject;
      });
      let handoffClaim: Awaited<ReturnType<typeof claimWorkflowConfirmHandoff>> | null = null;

      const channel = makeStreamChannel({
        event,
        portChannel: SessionChatStreamChannels.streamPort,
        portPayload: { streamId },
        logTag: "workflow-confirm-handoff",
        cancelOnPortClose: false,
        onReady: async (sink) => {
          let runner: StreamRunner | null = null;
          try {
            const result = await service.confirmProposal(
              request,
              async (record, workflowId, persist) => {
                try {
                  const claim = await claimWorkflowConfirmHandoff(record, workflowId, persist);
                  if (claim.status !== "accepted") return false;
                  handoffClaim = claim;
                  try {
                    runner = await claim.start(sink);
                    return true;
                  } catch {
                    await claim.abort();
                    handoffClaim = null;
                    return false;
                  }
                } catch {
                  return false;
                }
              }
            );
            resolveConfirmation(result);
            return runner ?? completedStreamRunner(sink);
          } catch (error) {
            if (handoffClaim?.status === "accepted") {
              await handoffClaim.abort().catch(() => undefined);
            }
            handoffClaim = null;
            rejectConfirmation(error);
            throw error;
          }
        },
      });
      if (!channel.ok) {
        throw ipcError(channel.error.code, channel.error.message);
      }
      const result = await confirmation;
      return { status: "accepted", result };
    })
  );

  ipcMain.handle(AutomationWorkflowProposalChannels.cancel, (event, input: unknown) =>
    wrapHandler(async () => {
      const request = validate(cancelWorkflowProposalInputSchema, input);
      requireWorkspaceSender(event.sender, request.workspaceId);
      await assertWorkflowProposalOwner(request.workspaceId, request.parentSessionId);
      return service.cancelProposal(request);
    })
  );
}
