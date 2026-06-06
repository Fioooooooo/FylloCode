import { ref } from "vue";
import { defineStore } from "pinia";
import type { UIMessage } from "ai";
import { proposalApi } from "@renderer/api/proposal";
import { useUIMessageAssembler } from "@renderer/composables/useUIMessageAssembler";
import type { MessageMeta } from "@shared/types/chat";
import type { ApplyRunMeta, ArchiveRunMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";

export const useProposalRunStore = defineStore("proposal-run", () => {
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

  async function startRun(projectId: string, changeId: string, workflowId: string): Promise<void> {
    const result = await proposalApi.apply({ projectId, changeId, workflowId });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const now = new Date().toISOString();
    runMeta.value = {
      runId: result.data.runId,
      changeId,
      workflowId,
      stages: result.data.stages,
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: now,
      updatedAt: now,
    };
    archiveRunMeta.value = null;
    assembler.setMessages([]);
    streamCurrentStage(projectId, changeId);
  }

  function buildArchiveRunMeta(changeId: string): ApplyRunMeta {
    const now = new Date().toISOString();
    const stage: WorkflowStage = {
      id: "archive",
      name: "归档",
      type: "proposal-archive",
    };

    return {
      runId: `archive-${Date.now()}`,
      changeId,
      workflowId: "archive",
      stages: [stage],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: "running",
      startedAt: now,
      updatedAt: now,
    };
  }

  function buildArchiveRunMetaView(meta: ArchiveRunMeta): ApplyRunMeta {
    const stage: WorkflowStage = {
      id: "archive",
      name: "归档",
      type: "proposal-archive",
    };

    return {
      runId: meta.runId,
      changeId: meta.changeId,
      workflowId: "archive",
      stages: [stage],
      currentStageIndex: 0,
      stageAcpSessionIds: {},
      status: meta.status,
      startedAt: meta.startedAt,
      updatedAt: meta.updatedAt,
    };
  }

  function streamCurrentStage(projectId: string, changeId: string): void {
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
    cancelFn.value = proposalApi.stageStream(
      {
        runId: meta.runId,
        stageIndex,
        projectId,
        changeId,
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

          const nextIndex = stageIndex + 1;
          runMeta.value = {
            ...current,
            currentStageIndex: nextIndex,
            status: nextIndex >= current.stages.length ? "done" : "running",
            updatedAt: new Date().toISOString(),
          };

          if (nextIndex < current.stages.length) {
            streamCurrentStage(projectId, changeId);
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

  async function resumeRun(projectId: string, changeId: string): Promise<void> {
    clearRunState();

    const result = await proposalApi.loadRun({ projectId, changeId });
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

    const messagesResult = await proposalApi.loadRunMessages({ projectId, changeId, stageIndex });
    if (!messagesResult.ok) {
      throw new Error(messagesResult.error.message);
    }

    assembler.setMessages(messagesResult.data);
  }

  async function resumeArchive(projectId: string, changeId: string): Promise<boolean> {
    const archiveResult = await proposalApi.loadArchive({ projectId, changeId });
    if (!archiveResult.ok) {
      throw new Error(archiveResult.error.message);
    }

    if (!archiveResult.data) {
      return false;
    }

    const messagesResult = await proposalApi.loadArchiveMessages({ projectId, changeId });
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

  async function startArchive(projectId: string, changeId: string): Promise<void> {
    const previousMeta = runMeta.value;
    const previousArchiveMeta = archiveRunMeta.value;
    runMeta.value = buildArchiveRunMeta(changeId);
    archiveRunMeta.value = null;
    assembler.setMessages([]);
    isStreaming.value = true;
    isArchiving.value = true;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      cancelFn.value = proposalApi.archive(
        {
          projectId,
          changeId,
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
