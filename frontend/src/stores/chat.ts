import { ref } from "vue";
import { defineStore } from "pinia";
import { generateId } from "ai";
import { useToast } from "@nuxt/ui/composables";
import type { ChatStatus, Message, ModeType, Session, TokenUsage } from "@shared/types/chat";
import { chatApi } from "@renderer/api/chat";
import { useUIMessageAssembler } from "@renderer/composables/useUIMessageAssembler";
import { useProjectStore } from "./project";
import { useSessionStore } from "./session";

const DEFAULT_SESSION_TITLE = "New Session";
const FALLBACK_SESSION_TITLE_MAX_LENGTH = 30;

function buildUserMessage(sessionId: string, content: string): Message {
  return {
    id: generateId(),
    role: "user",
    parts: [{ type: "text", text: content }],
    metadata: { sessionId, createdAt: new Date() },
  };
}

function buildFallbackSessionTitle(content: string): string {
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
  const tokenUsage = ref<TokenUsage>({
    input: 12450,
    output: 8932,
    total: 21382,
    estimatedCost: "$0.64",
  });

  function queueUserMessage(
    session: Session,
    content: string,
    sessionStore: ReturnType<typeof useSessionStore>
  ): Message {
    const userMessage = buildUserMessage(session.id, content);
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
    prompt: string,
    sessionStore: ReturnType<typeof useSessionStore>
  ): void {
    const assembler = useUIMessageAssembler(ref(activeSession.messages), {
      sessionId: activeSession.id,
    });

    chatApi.streamMessage(activeSession.id, projectId, activeSession.agentId, prompt, {
      onChunk(data) {
        if (chatStatus.value === "submitted") {
          chatStatus.value = "streaming";
        }

        if (data.kind === "session_info_update") {
          activeSession.title = data.title;
          activeSession.updatedAt = new Date();
          sessionStore.sortSessions();
          return;
        }

        assembler.applyChunk(data);
      },
      onDone(done) {
        assembler.resetActive();
        chatStatus.value = "ready";
        tokenUsage.value = {
          ...tokenUsage.value,
          output: tokenUsage.value.output + done.totalTokens,
          total: tokenUsage.value.total + done.totalTokens,
        };
        activeSession.updatedAt = new Date();
        activeSession.status = "ended";
        sessionStore.sortSessions();
      },
      onError(err) {
        assembler.resetActive();
        chatStatus.value = "error";
        activeSession.status = "ended";
        activeSession.updatedAt = new Date();
        sessionStore.sortSessions();
        console.error("Stream error:", err.code, err.message);
      },
    });
  }

  async function sendMessage(content: string): Promise<void> {
    const prompt = content.trim();
    if (!prompt) {
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
      const fallbackTitleSnapshot = buildFallbackSessionTitle(prompt);

      try {
        const createdSession = await sessionStore.createSession({
          projectId: projectIdSnapshot,
          agentId: draftAgentIdSnapshot,
          title: fallbackTitleSnapshot,
        });
        activeSession = sessionStore.activeSession ?? createdSession;
      } catch (error: unknown) {
        chatStatus.value = "ready";
        toast.add({
          title: "创建会话失败",
          description: error instanceof Error ? error.message : String(error),
          color: "error",
        });
        return;
      }
    }

    const userMessage = queueUserMessage(activeSession, prompt, sessionStore);
    chatStatus.value = "submitted";
    persistMessage(activeSession.id, projectIdSnapshot, userMessage);
    streamSessionMessage(activeSession, projectIdSnapshot, prompt, sessionStore);
  }

  function setMode(newMode: ModeType): void {
    mode.value = newMode;
  }

  return {
    chatStatus,
    mode,
    tokenUsage,
    sendMessage,
    setMode,
  };
});
