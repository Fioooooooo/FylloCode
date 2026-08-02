import { ref, type Ref } from "vue";
import { defineStore } from "pinia";
import type { UIMessage } from "ai";
import { proposalApplyApi } from "@renderer/api/proposal/apply";
import { proposalArchiveApi } from "@renderer/api/proposal/archive";
import { useUIMessageAssembler } from "@renderer/composables/useUIMessageAssembler";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta, ArchiveRunMeta, ProposalRef } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";

export interface ProposalRunStore {
  runMeta: Ref<ApplyRunMeta | null>;
  archiveRunMeta: Ref<ArchiveRunMeta | null>;
  messages: Ref<UIMessage<MessageMeta>[]>;
  isStreaming: Ref<boolean>;
  isArchiving: Ref<boolean>;
  cancelFn: Ref<(() => void) | null>;
  startRun: (workspaceId: string, proposalRef: ProposalRef, workflowId: string) => Promise<void>;
  startArchive: (workspaceId: string, proposalRef: ProposalRef) => Promise<void>;
  streamCurrentStage: (workspaceId: string) => void;
  resumeRun: (workspaceId: string, proposalRef: ProposalRef) => Promise<void>;
  resumeArchive: (workspaceId: string, proposalRef: ProposalRef) => Promise<boolean>;
  cancelRun: () => void;
}

export const useProposalRunStore = defineStore("proposal-run", (): ProposalRunStore => {
  const runMeta = ref<ApplyRunMeta | null>(null);
  const archiveRunMeta = ref<ArchiveRunMeta | null>(null);
  const messages = ref<UIMessage<MessageMeta>[]>([]);
  const isStreaming = ref(false);
  const cancelFn = ref<(() => void) | null>(null);
  const isArchiving = ref(false);
  const assembler = useUIMessageAssembler(messages, {
    sessionId: () => archiveRunMeta.value?.runId ?? runMeta.value?.runId ?? "proposal-run",
  });

  function clearRunState(): void {
    runMeta.value = null;
    archiveRunMeta.value = null;
    messages.value = [];
    isStreaming.value = false;
    cancelFn.value = null;
    assembler.resetActive();
  }

  async function startRun(
    workspaceId: string,
    proposalRef: ProposalRef,
    workflowId: string
  ): Promise<void> {
    const result = await proposalApplyApi.apply({ workspaceId, ...proposalRef, workflowId });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const persisted = await proposalApplyApi.loadRun({ workspaceId, ...proposalRef });
    if (!persisted.ok || !persisted.data || persisted.data.runId !== result.data.runId) {
      throw new Error(persisted.ok ? "创建后的 proposal run 不可用" : persisted.error.message);
    }
    runMeta.value = persisted.data;
    archiveRunMeta.value = null;
    assembler.setMessages([]);
    streamCurrentStage(workspaceId);
  }

  function buildArchiveRunMeta(proposalRef: ProposalRef, worktreePath: string): ApplyRunMeta {
    const now = new Date().toISOString();
    const stage: WorkflowStage = {
      id: "archive",
      name: "归档",
      type: "proposal-archive",
    };

    return {
      runId: `archive-${Date.now()}`,
      proposalRef,
      worktreePath,
      workflowId: "archive",
      stages: [stage],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: now,
      updatedAt: now,
    };
  }

  // 将 ArchiveRunMeta 投影为 ApplyRunMeta 视图，使 archive 阶段能复用阶段流 UI 组件。
  function buildArchiveRunMetaView(meta: ArchiveRunMeta): ApplyRunMeta {
    const stage: WorkflowStage = {
      id: "archive",
      name: "归档",
      type: "proposal-archive",
    };

    return {
      runId: meta.runId,
      proposalRef: meta.proposalRef,
      worktreePath: meta.worktreePath,
      workflowId: "archive",
      stages: [stage],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: meta.status,
      startedAt: meta.startedAt,
      updatedAt: meta.updatedAt,
    };
  }

  function streamCurrentStage(workspaceId: string): void {
    const meta = runMeta.value;
    if (!meta) {
      return;
    }

    const stageIndex = meta.currentStageIndex;
    if (stageIndex >= meta.stages.length) {
      runMeta.value = { ...meta, status: "done", updatedAt: new Date().toISOString() };
      isStreaming.value = false;
      return;
    }

    archiveRunMeta.value = null;
    assembler.setMessages([]);
    isStreaming.value = true;
    cancelFn.value = proposalApplyApi.stageStream(
      {
        runId: meta.runId,
        stageIndex,
        workspaceId,
        ...meta.proposalRef,
      },
      {
        onChunk(data) {
          assembler.applyChunk(data);
        },
        onDone() {
          isStreaming.value = false;
          cancelFn.value = null;
          assembler.resetActive();

          const current = runMeta.value;
          if (!current) {
            return;
          }

          // 当前阶段完成后自动推进到下一阶段；所有阶段完成则标记 run 为 done。
          const nextIndex = stageIndex + 1;
          runMeta.value = {
            ...current,
            currentStageIndex: nextIndex,
            status: nextIndex >= current.stages.length ? "done" : "running",
            updatedAt: new Date().toISOString(),
          };

          if (nextIndex < current.stages.length) {
            streamCurrentStage(workspaceId);
          }
        },
        onError(error) {
          console.error("Proposal apply stream error:", error.code, error.message);
          isStreaming.value = false;
          cancelFn.value = null;
          assembler.resetActive();

          if (runMeta.value) {
            runMeta.value = {
              ...runMeta.value,
              status: "error",
              updatedAt: new Date().toISOString(),
            };
          }
        },
      }
    );
  }

  async function resumeRun(workspaceId: string, proposalRef: ProposalRef): Promise<void> {
    clearRunState();

    const result = await proposalApplyApi.loadRun({ workspaceId, ...proposalRef });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      return;
    }

    runMeta.value = result.data;
    archiveRunMeta.value = null;

    const maxStageIndex = Math.max(result.data.stages.length - 1, 0);
    const stageIndex =
      result.data.status === "done"
        ? Math.max(Math.min(result.data.currentStageIndex - 1, maxStageIndex), 0)
        : Math.min(result.data.currentStageIndex, maxStageIndex);

    const messagesResult = await proposalApplyApi.loadRunMessages({
      workspaceId,
      ...proposalRef,
      stageIndex,
    });
    if (!messagesResult.ok) {
      throw new Error(messagesResult.error.message);
    }

    assembler.setMessages(messagesResult.data);
  }

  async function resumeArchive(workspaceId: string, proposalRef: ProposalRef): Promise<boolean> {
    const archiveResult = await proposalArchiveApi.loadArchive({ workspaceId, ...proposalRef });
    if (!archiveResult.ok) {
      throw new Error(archiveResult.error.message);
    }

    if (!archiveResult.data) {
      return false;
    }

    const messagesResult = await proposalArchiveApi.loadArchiveMessages({
      workspaceId,
      ...proposalRef,
    });
    if (!messagesResult.ok) {
      throw new Error(messagesResult.error.message);
    }

    archiveRunMeta.value = archiveResult.data;
    runMeta.value = buildArchiveRunMetaView(archiveResult.data);
    assembler.setMessages(messagesResult.data);
    isStreaming.value = archiveResult.data.status === "running";
    isArchiving.value = archiveResult.data.status === "running";
    cancelFn.value = null;
    return true;
  }

  async function startArchive(workspaceId: string, proposalRef: ProposalRef): Promise<void> {
    const previousMeta = runMeta.value;
    const previousArchiveMeta = archiveRunMeta.value;
    runMeta.value = buildArchiveRunMeta(proposalRef, previousMeta?.worktreePath ?? "");
    archiveRunMeta.value = null;
    assembler.setMessages([]);
    isStreaming.value = true;
    isArchiving.value = true;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      cancelFn.value = proposalArchiveApi.archive(
        {
          workspaceId,
          ...proposalRef,
        },
        {
          onChunk(data) {
            assembler.applyChunk(data);
          },
          onDone() {
            settled = true;
            isStreaming.value = false;
            isArchiving.value = false;
            cancelFn.value = null;
            assembler.resetActive();
            runMeta.value = previousMeta;
            archiveRunMeta.value = previousArchiveMeta;
            resolve();
          },
          onError(error) {
            console.error("Proposal archive stream error:", error.code, error.message);
            settled = true;
            isStreaming.value = false;
            isArchiving.value = false;
            cancelFn.value = null;
            assembler.resetActive();
            runMeta.value = previousMeta;
            archiveRunMeta.value = previousArchiveMeta;
            reject(new Error(error.message));
          },
        }
      );

      if (!cancelFn.value && !settled) {
        isStreaming.value = false;
        isArchiving.value = false;
      }
    });
  }

  function cancelRun(): void {
    cancelFn.value?.();
    cancelFn.value = null;
    isStreaming.value = false;
    isArchiving.value = false;
    assembler.resetActive();
  }

  return {
    runMeta,
    archiveRunMeta,
    messages,
    isStreaming,
    isArchiving,
    cancelFn,
    startRun,
    startArchive,
    streamCurrentStage,
    resumeRun,
    resumeArchive,
    cancelRun,
  };
});
