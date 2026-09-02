import type {
  AcpSessionRecoveryState,
  AcpSessionStore,
} from "@main/domain/session/chat/acp-session-store";
import {
  loadWorkflowRunSnapshot,
  saveWorkflowRunSnapshot,
  type WorkflowRunOwner,
} from "@main/infra/storage/workflow-run-store";
import type { WorkflowRunSnapshot } from "@shared/types/workflow";

export interface WorkflowSessionOwner extends WorkflowRunOwner {
  sessionId: string;
}

export interface WorkflowAcpSessionStoreDependencies {
  loadSnapshot: typeof loadWorkflowRunSnapshot;
  saveSnapshot: typeof saveWorkflowRunSnapshot;
  updateSnapshot?: (
    owner: WorkflowRunOwner,
    updater: (snapshot: WorkflowRunSnapshot) => WorkflowRunSnapshot | null
  ) => Promise<WorkflowRunSnapshot | null>;
  now: () => string;
}

const defaultDependencies: WorkflowAcpSessionStoreDependencies = {
  loadSnapshot: loadWorkflowRunSnapshot,
  saveSnapshot: saveWorkflowRunSnapshot,
  now: () => new Date().toISOString(),
};

/**
 * ACP recovery metadata for a workflow-owned fresh session.
 *
 * The metadata lives in the Run snapshot rather than chat or spawned-session storage. The
 * logical session id is fixed by the engine before ACP starts; only the provider ACP id is
 * patched after activation resolves.
 */
export class WorkflowAcpSessionStore implements AcpSessionStore {
  private readonly dependencies: WorkflowAcpSessionStoreDependencies;

  constructor(
    private readonly owner: WorkflowSessionOwner,
    dependencies: Partial<WorkflowAcpSessionStoreDependencies> = {}
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async loadRecoveryState(): Promise<AcpSessionRecoveryState> {
    const snapshot = await this.dependencies.loadSnapshot(this.owner);
    if (!snapshot || snapshot.agentSessionState?.sessionId !== this.owner.sessionId) {
      return { acpSessionId: null, configOptions: [] };
    }
    return {
      acpSessionId: snapshot.agentSessionState.acpSessionId ?? null,
      configOptions: [],
    };
  }

  async persistAcpSessionId(acpSessionId: string): Promise<void> {
    if (this.dependencies.updateSnapshot) {
      const updated = await this.dependencies.updateSnapshot(this.owner, (snapshot) => {
        this.assertSnapshotOwner(snapshot);
        return {
          ...snapshot,
          agentSessionState: {
            sessionId: this.owner.sessionId,
            acpSessionId,
          },
          updatedAt: this.dependencies.now(),
        };
      });
      if (!updated) {
        throw Object.assign(new Error(`Workflow Run snapshot not found: ${this.owner.runId}`), {
          code: "WORKFLOW_RUN_NOT_FOUND",
        });
      }
      return;
    }

    const snapshot = await this.dependencies.loadSnapshot(this.owner);
    this.assertSnapshotOwner(snapshot);
    await this.dependencies.saveSnapshot(this.owner, {
      ...snapshot,
      agentSessionState: {
        sessionId: this.owner.sessionId,
        acpSessionId,
      },
      updatedAt: this.dependencies.now(),
    });
  }

  private assertSnapshotOwner(
    snapshot: WorkflowRunSnapshot | null
  ): asserts snapshot is WorkflowRunSnapshot {
    if (!snapshot) {
      throw Object.assign(new Error(`Workflow Run snapshot not found: ${this.owner.runId}`), {
        code: "WORKFLOW_RUN_NOT_FOUND",
      });
    }
    if (
      snapshot.workflowId !== this.owner.workflowId ||
      snapshot.parentSessionId !== this.owner.parentSessionId ||
      snapshot.agentSessionState?.sessionId !== this.owner.sessionId
    ) {
      throw Object.assign(new Error("Workflow ACP session owner does not match Run snapshot"), {
        code: "WORKFLOW_SESSION_OWNER_MISMATCH",
      });
    }
  }
}
