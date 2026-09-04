import { ipcMain } from "electron";
import { AutomationWorkflowProposalDecisionChannels } from "@shared/ipc/automation/workflow-proposal-decision.channels";
import {
  dispatchWorkflowProposalDecisionInputSchema,
  listWorkflowProposalDecisionsInputSchema,
} from "@shared/ipc/automation/workflow-proposal-decision.schemas";
import { SessionChatStreamChannels } from "@shared/ipc/session/chat.channels";
import type { WorkflowProposalDecisionDispatchResult } from "@shared/types/workflow";
import {
  workflowDecisionService,
  type WorkflowDecisionService,
} from "@main/services/automation/workflow/workflow-decision-service";
import {
  workflowProposalService,
  type WorkflowProposalService,
} from "@main/services/automation/workflow/workflow-proposal-service";
import type { WorkspaceWindowManager } from "@main/bootstrap/workspace-window-manager";
import { getRequiredWorkspaceInfo } from "@main/services/workspace/_public";
import { claimWorkflowDecisionTurn } from "@main/services/session/chat/chat-turn-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";
import { requireWorkspaceSender } from "../_kit/workspace-scope";
import { makeStreamChannel } from "../_kit/stream-channel";
import { ipcError } from "../_kit/errors";

export interface WorkflowProposalDecisionHandlerService {
  list(workspaceId: string): ReturnType<WorkflowDecisionService["list"]>;
  reconcileWorkspace(
    workspaceId: string
  ): ReturnType<WorkflowDecisionService["reconcileWorkspace"]>;
}

export interface WorkflowProposalDecisionWakeDispatcherOptions {
  delayMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export class WorkflowProposalDecisionWakeDispatcher {
  private readonly delayMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
    options: WorkflowProposalDecisionWakeDispatcherOptions = {}
  ) {
    this.delayMs = options.delayMs ?? 40;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
  }

  notify(workspaceId: string): void {
    if (this.closed || this.timers.has(workspaceId)) return;
    const timer = this.setTimer(() => {
      this.timers.delete(workspaceId);
      if (this.closed) return;
      this.manager.sendToWorkspace(workspaceId, AutomationWorkflowProposalDecisionChannels.wake, {
        workspaceId,
      });
    }, this.delayMs);
    timer.unref?.();
    this.timers.set(workspaceId, timer);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
  }
}

export function setupWorkflowProposalDecisionBroadcast(
  manager: Pick<WorkspaceWindowManager, "sendToWorkspace">,
  service: Pick<WorkflowDecisionService, "setWakeHandler"> = workflowDecisionService,
  proposalService: Pick<
    WorkflowProposalService,
    "setDecisionWakeHandler"
  > = workflowProposalService,
  options: WorkflowProposalDecisionWakeDispatcherOptions = {}
): () => void {
  const dispatcher = new WorkflowProposalDecisionWakeDispatcher(manager, options);
  service.setWakeHandler((workspaceId) => dispatcher.notify(workspaceId));
  proposalService.setDecisionWakeHandler((workspaceId) => dispatcher.notify(workspaceId));
  return () => {
    dispatcher.dispose();
    service.setWakeHandler(null);
    proposalService.setDecisionWakeHandler(null);
  };
}

async function assertDecisionWorkspace(workspaceId: string): Promise<void> {
  await getRequiredWorkspaceInfo(workspaceId);
}

export function registerWorkflowProposalDecisionHandlers(
  service: WorkflowProposalDecisionHandlerService = workflowDecisionService
): void {
  ipcMain.handle(AutomationWorkflowProposalDecisionChannels.list, (event, input: unknown) =>
    wrapHandler(async () => {
      const { workspaceId } = validate(listWorkflowProposalDecisionsInputSchema, input);
      requireWorkspaceSender(event.sender, workspaceId);
      await assertDecisionWorkspace(workspaceId);
      await service.reconcileWorkspace(workspaceId);
      return { decisions: await service.list(workspaceId) };
    })
  );

  ipcMain.handle(AutomationWorkflowProposalDecisionChannels.dispatch, (event, input: unknown) =>
    wrapHandler(async (): Promise<WorkflowProposalDecisionDispatchResult> => {
      const { workspaceId, notificationId, streamId } = validate(
        dispatchWorkflowProposalDecisionInputSchema,
        input
      );
      requireWorkspaceSender(event.sender, workspaceId);
      await assertDecisionWorkspace(workspaceId);
      const claim = await claimWorkflowDecisionTurn(workspaceId, notificationId);
      if (claim.status !== "accepted") return { status: claim.status };
      const channel = makeStreamChannel({
        event,
        portChannel: SessionChatStreamChannels.streamPort,
        portPayload: { streamId },
        logTag: "workflow-decision",
        cancelOnPortClose: false,
        onReady: (sink) => claim.start(sink),
      });
      if (!channel.ok) {
        await claim.abort();
        throw ipcError(channel.error.code, channel.error.message);
      }
      return { status: "accepted" };
    })
  );
}
