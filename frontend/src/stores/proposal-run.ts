import { ref } from "vue";
import { defineStore } from "pinia";
import { generateId, type DynamicToolUIPart, type UIMessage } from "ai";
import { proposalApi } from "@renderer/api/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";
import type { ApplyRunMeta } from "@shared/types/proposal";
import type { WorkflowStage } from "@shared/types/workflow";

export const useProposalRunStore = defineStore("proposal-run", () => {
  const runMeta = ref<ApplyRunMeta | null>(null);
  const messages = ref<UIMessage<MessageMeta>[]>([]);
  const isStreaming = ref(false);
  const cancelFn = ref<(() => void) | null>(null);
  const isArchiving = ref(false);

  let activeAssistantId: string | null = null;
  let activeTextPartIdx = -1;

  function resetActiveMessage(): void {
    activeAssistantId = null;
    activeTextPartIdx = -1;
  }

  function ensureAssistantMessage(): UIMessage<MessageMeta> {
    if (activeAssistantId) {
      const existing = messages.value.find((message) => message.id === activeAssistantId);
      if (existing) {
        return existing;
      }
    }

    const message: UIMessage<MessageMeta> = {
      id: generateId(),
      role: "assistant",
      parts: [],
      metadata: {
        sessionId: runMeta.value?.runId ?? "proposal-run",
        createdAt: new Date(),
      },
    };
    messages.value.push(message);
    activeAssistantId = message.id;
    activeTextPartIdx = -1;
    return message;
  }

  function applyChunk(data: MessageChunkData): void {
    if (data.kind === "text_delta") {
      const message = ensureAssistantMessage();
      const part = activeTextPartIdx >= 0 ? message.parts[activeTextPartIdx] : null;

      if (part && part.type === "text") {
        part.text += data.text;
      } else {
        message.parts.push({ type: "text", text: data.text });
        activeTextPartIdx = message.parts.length - 1;
      }
    } else if (data.kind === "tool_call_start") {
      const message = ensureAssistantMessage();
      const part: DynamicToolUIPart = {
        type: "dynamic-tool",
        toolCallId: data.toolCallId,
        toolName: data.title,
        state: "input-available",
        input: {},
      };
      message.parts.push(part);
      activeTextPartIdx = -1;
    } else if (data.kind === "tool_call_update") {
      if (!activeAssistantId) {
        return;
      }

      const message = messages.value.find((item) => item.id === activeAssistantId);
      if (!message) {
        return;
      }

      const idx = message.parts.findIndex(
        (part) => part.type === "dynamic-tool" && part.toolCallId === data.toolCallId
      );
      if (idx === -1) {
        return;
      }

      const prev = message.parts[idx] as DynamicToolUIPart;
      const description =
        typeof data.input?.description === "string" ? data.input.description : undefined;

      if (data.status === "in_progress") {
        const needsUpdate = data.input || data.content;
        if (needsUpdate) {
          message.parts.splice(idx, 1, {
            type: "dynamic-tool",
            toolCallId: prev.toolCallId,
            toolName: prev.toolName,
            title: description ?? data.content,
            state: "input-available",
            input: data.input ?? prev.input,
          } as DynamicToolUIPart);
        }
      } else if (data.status === "completed" || data.status === "failed") {
        message.parts.splice(idx, 1, {
          type: "dynamic-tool",
          toolCallId: prev.toolCallId,
          toolName: prev.toolName,
          title: prev.title,
          state: "output-available",
          input: prev.input,
          output: data.content ?? "",
        } as DynamicToolUIPart);
      }
    }
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
    messages.value = [];
    resetActiveMessage();
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

    messages.value = [];
    resetActiveMessage();
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
          applyChunk(data);
        },
        onDone() {
          isStreaming.value = false;
          cancelFn.value = null;
          resetActiveMessage();

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
          resetActiveMessage();

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
    const result = await proposalApi.loadRun({ projectId, changeId });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      runMeta.value = null;
      messages.value = [];
      isStreaming.value = false;
      cancelFn.value = null;
      resetActiveMessage();
      return;
    }

    runMeta.value = result.data;
    isStreaming.value = false;
    cancelFn.value = null;
    resetActiveMessage();

    const maxStageIndex = Math.max(result.data.stages.length - 1, 0);
    const stageIndex =
      result.data.status === "done"
        ? Math.max(Math.min(result.data.currentStageIndex - 1, maxStageIndex), 0)
        : Math.min(result.data.currentStageIndex, maxStageIndex);

    const messagesResult = await proposalApi.loadRunMessages({ projectId, changeId, stageIndex });
    if (!messagesResult.ok) {
      throw new Error(messagesResult.error.message);
    }

    messages.value = messagesResult.data;
  }

  async function startArchive(projectId: string, changeId: string): Promise<void> {
    const previousMeta = runMeta.value;
    runMeta.value = buildArchiveRunMeta(changeId);
    messages.value = [];
    resetActiveMessage();
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
            applyChunk(data);
          },
          onDone() {
            settled = true;
            isStreaming.value = false;
            isArchiving.value = false;
            cancelFn.value = null;
            resetActiveMessage();
            runMeta.value = previousMeta;
            resolve();
          },
          onError(error) {
            console.error("Proposal archive stream error:", error.code, error.message);
            settled = true;
            isStreaming.value = false;
            isArchiving.value = false;
            cancelFn.value = null;
            resetActiveMessage();
            runMeta.value = previousMeta;
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
    resetActiveMessage();
  }

  return {
    runMeta,
    messages,
    isStreaming,
    isArchiving,
    cancelFn,
    startRun,
    startArchive,
    streamCurrentStage,
    resumeRun,
    cancelRun,
  };
});
