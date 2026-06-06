import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { generateId } from "ai";
import { useToast } from "@nuxt/ui/composables";
import type { ChatStatus, Message, ModeType, Session } from "@shared/types/chat";
import type { MessageChunkData } from "@shared/types/ipc";
import type { ChatPromptPart } from "@shared/types/chat-prompt";
import { chatApi, type StreamError } from "@renderer/api/chat";
import { useUIMessageAssembler } from "@renderer/composables/useUIMessageAssembler";
import { isSystemReminderPart } from "@renderer/utils/system-reminder";
import { useProjectStore } from "./project";
import { useSessionStore } from "./session";

const DEFAULT_SESSION_TITLE = "New Session";
const FALLBACK_SESSION_TITLE_MAX_LENGTH = 30;

function buildUserMessage(sessionId: string, parts: ChatPromptPart[]): Message {
  return {
    id: generateId(),
    role: "user",
    parts: parts.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }

      return {
        type: "file",
        mediaType: part.mediaType,
        url: part.uri,
        filename: part.filename,
      };
    }) as Message["parts"],
    metadata: { sessionId, createdAt: new Date() },
  };
}

function getPrimaryText(parts: ChatPromptPart[]): string {
  const primary = parts.find((part) => part.type === "text" && !isSystemReminderPart(part));
  return primary?.type === "text" ? primary.text : "";
}

function buildFallbackSessionTitle(parts: ChatPromptPart[]): string {
  const content = getPrimaryText(parts);
  const taskTitle = content.match(/^\*\*标题\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (taskTitle) {
    return Array.from(taskTitle).slice(0, FALLBACK_SESSION_TITLE_MAX_LENGTH).join("");
  }

  const normalized = content.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return DEFAULT_SESSION_TITLE;
  }

  return Array.from(normalized).slice(0, FALLBACK_SESSION_TITLE_MAX_LENGTH).join("");
}

export const useChatStore = defineStore("chat", () => {
  const toast = useToast();
  const chatStatus = ref<ChatStatus>("ready");
  const mode = ref<ModeType>("manual");
  const cancelFn = ref<(() => void) | null>(null);
  const streamError = ref<StreamError | null>(null);
  const activeStreamRunId = ref(0);
  const pendingConfigIdSet = ref<Set<string>>(new Set());
  const pendingConfigIds = computed<ReadonlySet<string>>(() => pendingConfigIdSet.value);

  function markConfigOptionPending(configId: string): void {
    const next = new Set(pendingConfigIdSet.value);
    next.add(configId);
    pendingConfigIdSet.value = next;
  }

  function clearConfigOptionPending(configId: string): void {
    if (!pendingConfigIdSet.value.has(configId)) return;
    const next = new Set(pendingConfigIdSet.value);
    next.delete(configId);
    pendingConfigIdSet.value = next;
  }

  function beginStreamRun(): number {
    activeStreamRunId.value += 1;
    return activeStreamRunId.value;
  }

  function isCurrentStreamRun(runId: number): boolean {
    return activeStreamRunId.value === runId;
  }

  function clearActiveStreamControl(): void {
    cancelFn.value = null;
  }

  function invalidateActiveStreamRun(): void {
    beginStreamRun();
  }

  function resetChatState(): void {
    invalidateActiveStreamRun();
    chatStatus.value = "ready";
    streamError.value = null;
    clearActiveStreamControl();
  }

  function queueUserMessage(
    session: Session,
    parts: ChatPromptPart[],
    sessionStore: ReturnType<typeof useSessionStore>
  ): Message {
    const userMessage = buildUserMessage(session.id, parts);
    session.messages.push(userMessage);
    session.turnCount++;
    session.updatedAt = new Date();
    session.status = "running";
    sessionStore.sortSessions();
    return userMessage;
  }

  function persistMessage(sessionId: string, projectId: string, message: Message): void {
    void chatApi
      .persistMessage(sessionId, projectId, JSON.parse(JSON.stringify(message)) as Message)
      .catch((err: unknown) => {
        console.error("Failed to persist message:", err);
      });
  }

  function streamSessionMessage(
    activeSession: Session,
    projectId: string,
    parts: ChatPromptPart[],
    sessionStore: ReturnType<typeof useSessionStore>,
    streamRunId: number,
    options: { acpSessionId?: string }
  ): void {
    const assembler = useUIMessageAssembler(ref(activeSession.messages), {
      sessionId: activeSession.id,
    });

    cancelFn.value = chatApi.streamMessage(
      activeSession.id,
      projectId,
      activeSession.agentId,
      parts,
      {
        onChunk(data) {
          if (!isCurrentStreamRun(streamRunId)) {
            return;
          }

          switch (data.kind) {
            case "session_info_update":
              activeSession.title = data.title;
              activeSession.updatedAt = new Date();
              sessionStore.sortSessions();
              return;
            case "usage_update":
              activeSession.tokenUsage = {
                used: data.used,
                size: data.size,
                cost: data.cost,
              };
              return;
            case "available_commands_update":
              sessionStore.setSessionAvailableCommands(activeSession.id, data.commands);
              return;
            case "config_options_update":
              sessionStore.setSessionConfigOptions(activeSession.id, data.options);
              return;
            case "plan_update":
              sessionStore.setSessionPlan(activeSession.id, data.entries);
              return;
            case "user_message":
            case "status":
              return;
            case "text_delta":
            case "reasoning_delta":
            case "tool_call_start":
            case "tool_call_update":
              if (chatStatus.value === "submitted") {
                chatStatus.value = "streaming";
              }

              assembler.applyChunk(data);
              return;
            default: {
              void data;
              throw new Error(`unhandled stream chunk: ${(data as MessageChunkData).kind}`);
            }
          }
        },
        onDone(done) {
          if (!isCurrentStreamRun(streamRunId)) {
            return;
          }

          assembler.resetActive();
          clearActiveStreamControl();
          streamError.value = null;
          chatStatus.value = "ready";
          activeSession.tokenUsage = {
            ...activeSession.tokenUsage,
            used: activeSession.tokenUsage.used + done.totalTokens,
          };
          activeSession.updatedAt = new Date();
          activeSession.status = "ended";
          sessionStore.sortSessions();
        },
        onError(err) {
          if (!isCurrentStreamRun(streamRunId)) {
            return;
          }

          assembler.resetActive();
          clearActiveStreamControl();
          streamError.value = err;
          chatStatus.value = "error";
          activeSession.status = "ended";
          activeSession.updatedAt = new Date();
          sessionStore.sortSessions();
          console.error("Stream error:", err.code, err.message);
        },
      },
      options
    );
  }

  async function sendMessage(parts: ChatPromptPart[]): Promise<void> {
    const hasPromptContent = parts.some((part) => part.type !== "text" || part.text.trim());
    if (!hasPromptContent) {
      return;
    }

    const sessionStore = useSessionStore();
    const projectStore = useProjectStore();
    const currentSession = sessionStore.activeSession;
    const projectIdSnapshot = projectStore.currentProject?.id ?? currentSession?.projectId;

    if (!projectIdSnapshot) {
      return;
    }

    let activeSession = currentSession;
    let streamOptions: { acpSessionId?: string } = {};
    const streamRunId = beginStreamRun();
    streamError.value = null;

    if (!activeSession) {
      const draftAgentIdSnapshot = sessionStore.draftAgentId;
      if (!draftAgentIdSnapshot) {
        toast.add({
          title: "暂无可用 Agent",
          description: "请先安装 Agent 后再开始新会话",
          color: "error",
        });
        return;
      }

      chatStatus.value = "submitted";
      const fallbackTitleSnapshot = buildFallbackSessionTitle(parts);
      const probeBeforeCreate = sessionStore.draftProbeByAgent.get(draftAgentIdSnapshot);
      const carryProbe =
        probeBeforeCreate?.status === "ready" && probeBeforeCreate.acpSessionId
          ? {
              configOptions: JSON.parse(
                JSON.stringify(probeBeforeCreate.configOptions)
              ) as typeof probeBeforeCreate.configOptions,
              availableCommands: JSON.parse(
                JSON.stringify(probeBeforeCreate.availableCommands)
              ) as typeof probeBeforeCreate.availableCommands,
              acpSessionId: probeBeforeCreate.acpSessionId,
            }
          : null;

      try {
        const createdSession = await sessionStore.createSession({
          projectId: projectIdSnapshot,
          agentId: draftAgentIdSnapshot,
          title: fallbackTitleSnapshot,
          ...(carryProbe ?? {}),
        });
        if (!isCurrentStreamRun(streamRunId)) {
          return;
        }
        activeSession = sessionStore.activeSession ?? createdSession;
        if (carryProbe) {
          streamOptions = { acpSessionId: carryProbe.acpSessionId };
          sessionStore.applyProbeUpdate(draftAgentIdSnapshot, null);
        }
      } catch (error: unknown) {
        if (isCurrentStreamRun(streamRunId)) {
          chatStatus.value = "ready";
        }
        toast.add({
          title: "创建会话失败",
          description: error instanceof Error ? error.message : String(error),
          color: "error",
        });
        return;
      }
    }

    if (!isCurrentStreamRun(streamRunId)) {
      return;
    }

    const userMessage = queueUserMessage(activeSession, parts, sessionStore);
    chatStatus.value = "submitted";
    persistMessage(activeSession.id, projectIdSnapshot, userMessage);
    streamSessionMessage(
      activeSession,
      projectIdSnapshot,
      parts,
      sessionStore,
      streamRunId,
      streamOptions
    );
  }

  function setMode(newMode: ModeType): void {
    mode.value = newMode;
  }

  function cancelStream(): void {
    if (chatStatus.value !== "submitted" && chatStatus.value !== "streaming") {
      return;
    }

    const currentCancel = cancelFn.value;
    invalidateActiveStreamRun();
    currentCancel?.();
    clearActiveStreamControl();
    streamError.value = null;
    chatStatus.value = "ready";

    const sessionStore = useSessionStore();
    if (sessionStore.activeSession) {
      sessionStore.activeSession.status = "ended";
    }
  }

  async function setConfigOption(input: {
    sessionId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<void> {
    const sessionStore = useSessionStore();
    const session = sessionStore.sessions.find((item) => item.id === input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const target = session.configOptions?.find((option) => option.id === input.configId);
    if (!target) {
      throw new Error(`Config option not found: ${input.configId}`);
    }

    const previousValue = target.currentValue;
    if (target.type === "select" && typeof input.value === "string") {
      target.currentValue = input.value;
    } else if (target.type === "boolean" && typeof input.value === "boolean") {
      target.currentValue = input.value;
    }

    markConfigOptionPending(input.configId);

    try {
      const result = await chatApi.setConfigOption({
        projectId: session.projectId,
        sessionId: input.sessionId,
        configId: input.configId,
        type: input.type,
        value: input.value,
      });

      if (!result.ok) {
        throw new Error(result.error.message || result.error.code);
      }

      sessionStore.setSessionConfigOptions(input.sessionId, result.data.configOptions);
    } catch (error: unknown) {
      const rollbackTarget = sessionStore.sessions
        .find((item) => item.id === input.sessionId)
        ?.configOptions?.find((option) => option.id === input.configId);
      if (rollbackTarget && rollbackTarget.type === target.type) {
        if (rollbackTarget.type === "select" && typeof previousValue === "string") {
          rollbackTarget.currentValue = previousValue;
        } else if (rollbackTarget.type === "boolean" && typeof previousValue === "boolean") {
          rollbackTarget.currentValue = previousValue;
        }
      }
      toast.add({
        title: "切换 Session 配置失败",
        description: error instanceof Error ? error.message : String(error),
        color: "error",
      });
      throw error;
    } finally {
      clearConfigOptionPending(input.configId);
    }
  }

  return {
    chatStatus,
    mode,
    cancelFn,
    streamError,
    pendingConfigIds,
    markConfigOptionPending,
    clearConfigOptionPending,
    sendMessage,
    setMode,
    resetChatState,
    cancelStream,
    setConfigOption,
  };
});
