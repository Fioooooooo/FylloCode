import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand, Message, Session, TokenUsage } from "@shared/types/chat";
import { chatApi } from "@renderer/api/chat";
import { useAcpAgentsStore } from "./acp-agents";
import { useProjectStore } from "./project";

type SerializableDate = Date | string;

type SerializedMessage = Omit<Message, "metadata"> & {
  metadata?: {
    sessionId: string;
    createdAt: SerializableDate;
  };
};

type SerializedSession = Omit<Session, "createdAt" | "updatedAt" | "messages" | "tokenUsage"> & {
  createdAt: SerializableDate;
  updatedAt: SerializableDate;
  tokenUsage?: Partial<TokenUsage>;
  messages: SerializedMessage[];
};

function toDate(value: SerializableDate): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeMessage(message: SerializedMessage): Message {
  if (!message.metadata) {
    return message as Message;
  }

  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt: toDate(message.metadata.createdAt),
    },
  } as Message;
}

function normalizeTokenUsage(tokenUsage: Partial<TokenUsage> | null | undefined): TokenUsage {
  return {
    used: typeof tokenUsage?.used === "number" ? tokenUsage.used : 0,
    size: typeof tokenUsage?.size === "number" ? tokenUsage.size : 0,
    cost: tokenUsage?.cost,
  };
}

function normalizeSession(session: SerializedSession): Session {
  return {
    ...session,
    tokenUsage: normalizeTokenUsage(session.tokenUsage),
    createdAt: toDate(session.createdAt),
    updatedAt: toDate(session.updatedAt),
    messages: session.messages.map((message) => normalizeMessage(message)),
  };
}

function sortByUpdatedAt<T extends Pick<Session, "updatedAt">>(items: T[]): T[] {
  return [...items].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export const useSessionStore = defineStore("session", () => {
  const acpAgentsStore = useAcpAgentsStore();
  const sessions = ref<Session[]>([]);
  const activeSessionId = ref<string | null>(null);
  const draftAgentId = ref<string | null>(null);
  const isLoading = ref(false);
  const activeSession = computed<Session | null>(
    () => sessions.value.find((session) => session.id === activeSessionId.value) ?? null
  );
  const loadedSessionIds = new Set<string>();

  function syncDraftAgentId(preferredAgentId: string | null = draftAgentId.value): void {
    draftAgentId.value = acpAgentsStore.resolveInstalledAgent(preferredAgentId);
  }

  function sortSessions(): void {
    sessions.value = sortByUpdatedAt(sessions.value);
  }

  function findSession(sessionId: string): Session | null {
    return sessions.value.find((session) => session.id === sessionId) ?? null;
  }

  function clearSessions(): void {
    sessions.value = [];
    activeSessionId.value = null;
    loadedSessionIds.clear();
    syncDraftAgentId();
  }

  function beginDraftSession(): void {
    const preferredAgentId = activeSession.value?.agentId ?? draftAgentId.value;
    activeSessionId.value = null;
    syncDraftAgentId(preferredAgentId);
  }

  function setDraftAgent(agentId: string): void {
    if (!acpAgentsStore.isInstalledAgent(agentId)) {
      return;
    }

    draftAgentId.value = agentId;
  }

  function mergeSessionMeta(nextSession: Session): Session | null {
    const session = sessions.value.find((item) => item.id === nextSession.id);
    if (!session) {
      return null;
    }

    session.projectId = nextSession.projectId;
    session.agentId = nextSession.agentId;
    session.title = nextSession.title;
    session.status = nextSession.status;
    session.turnCount = nextSession.turnCount;
    session.tokenUsage = normalizeTokenUsage(nextSession.tokenUsage);
    session.createdAt = nextSession.createdAt;
    session.updatedAt = nextSession.updatedAt;
    session.availableCommands = nextSession.availableCommands;
    session.configOptions = nextSession.configOptions;
    return session;
  }

  function setSessionAvailableCommands(sessionId: string, commands: AcpAvailableCommand[]): void {
    const session = findSession(sessionId);
    if (!session) {
      return;
    }

    session.availableCommands = commands;
  }

  function setSessionConfigOptions(sessionId: string, options: AcpSessionConfigOption[]): void {
    const session = findSession(sessionId);
    if (!session) {
      return;
    }

    session.configOptions = options;
  }

  async function loadSessions(projectId: string): Promise<void> {
    isLoading.value = true;

    try {
      const result = await chatApi.listSessions({ projectId });
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      loadedSessionIds.clear();
      sessions.value = sortByUpdatedAt(result.data.map((session) => normalizeSession(session)));
      activeSessionId.value = null;
      syncDraftAgentId();
    } finally {
      isLoading.value = false;
    }
  }

  async function createSession(input: {
    projectId: string;
    agentId: string;
    title?: string;
  }): Promise<Session> {
    const result = await chatApi.createSession({
      projectId: input.projectId,
      title: input.title ?? "New Session",
      agentId: input.agentId,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const session = normalizeSession(result.data);
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)];
    activeSessionId.value = session.id;
    loadedSessionIds.add(session.id);
    return findSession(session.id) ?? session;
  }

  async function selectSession(sessionId: string): Promise<void> {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    activeSessionId.value = sessionId;

    if (session.messages.length > 0 || loadedSessionIds.has(sessionId)) {
      return;
    }

    const projectStore = useProjectStore();
    const projectId = projectStore.currentProject?.id ?? session.projectId;
    const result = await chatApi.loadMessages(sessionId, projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    session.messages = result.data.map((message) => normalizeMessage(message));
    loadedSessionIds.add(sessionId);
  }

  async function renameSession(sessionId: string, title: string): Promise<void> {
    const projectStore = useProjectStore();
    const projectId = projectStore.currentProject?.id;
    if (!projectId) {
      throw new Error("Cannot rename session without an active project");
    }

    const result = await chatApi.updateSession(sessionId, { title }, projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    mergeSessionMeta(normalizeSession(result.data));
    sortSessions();
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const projectStore = useProjectStore();
    const projectId = projectStore.currentProject?.id;
    if (!projectId) {
      throw new Error("Cannot delete session without an active project");
    }

    const result = await chatApi.removeSession(sessionId, projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const wasActive = activeSessionId.value === sessionId;
    sessions.value = sessions.value.filter((session) => session.id !== sessionId);
    loadedSessionIds.delete(sessionId);

    if (!wasActive) {
      return;
    }

    const nextSessionId = sessions.value[0]?.id ?? null;
    activeSessionId.value = null;
    if (nextSessionId) {
      await selectSession(nextSessionId);
      return;
    }

    syncDraftAgentId();
  }

  async function setSessionAgent(agentId: string): Promise<void> {
    const session = activeSession.value;
    if (!session || session.agentId === agentId) {
      return;
    }

    const projectStore = useProjectStore();
    const projectId = projectStore.currentProject?.id ?? session.projectId;
    const result = await chatApi.updateSession(session.id, { agentId }, projectId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    mergeSessionMeta(normalizeSession(result.data));
    sortSessions();
  }

  watch(
    () => [...acpAgentsStore.installedAgentIds],
    () => {
      if (activeSessionId.value === null) {
        syncDraftAgentId();
      }
    },
    { immediate: true }
  );

  return {
    sessions,
    activeSessionId,
    activeSession,
    draftAgentId,
    isLoading,
    loadSessions,
    createSession,
    beginDraftSession,
    selectSession,
    renameSession,
    deleteSession,
    setSessionAgent,
    setSessionAvailableCommands,
    setSessionConfigOptions,
    setDraftAgent,
    clearSessions,
    sortSessions,
  };
});
