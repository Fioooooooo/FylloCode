import { computed, ref, watch, type Ref, type ComputedRef } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type {
  AcpAvailableCommand,
  Message,
  PlanEntry,
  Session,
  TokenUsage,
} from "@shared/types/chat";
import type { ProbeSnapshot, ProbeStatus } from "@shared/types/chat-probe";
import { chatApi } from "@renderer/api/chat";
import { useAcpAgentsStore } from "./acp-agents";
import { useChatStore } from "./chat";
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

export type DraftProbeStatus = ProbeStatus;

export interface DraftProbeState {
  agentId: string;
  status: DraftProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
}

export interface SessionStore {
  sessions: Ref<Session[]>;
  activeSessionId: Ref<string | null>;
  activeSession: ComputedRef<Session | null>;
  draftAgentId: Ref<string | null>;
  draftProbeByAgent: Ref<Map<string, DraftProbeState>>;
  activeDraftProbe: ComputedRef<DraftProbeState | null>;
  isLoading: Ref<boolean>;
  isLoadingMessages: Ref<boolean>;
  loadSessions: (projectId: string) => Promise<void>;
  createSession: (input: {
    projectId: string;
    agentId: string;
    title?: string;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
  }) => Promise<Session>;
  beginDraftSession: () => void;
  selectSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setSessionAgent: (agentId: string) => Promise<void>;
  setSessionAvailableCommands: (sessionId: string, commands: AcpAvailableCommand[]) => void;
  setSessionConfigOptions: (sessionId: string, options: AcpSessionConfigOption[]) => void;
  setSessionPlan: (sessionId: string, entries: PlanEntry[]) => void;
  ensureDraftProbe: (agentId: string, projectId: string) => Promise<void>;
  closeDraftProbe: (agentId: string) => Promise<void>;
  setDraftConfigOption: (input: {
    agentId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }) => Promise<void>;
  applyProbeUpdate: (agentId: string, snapshot: ProbeSnapshot | null) => void;
  subscribeProbeUpdates: () => () => void;
  setDraftAgent: (agentId: string) => void;
  clearSessions: () => void;
  sortSessions: () => void;
}

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

export const useSessionStore = defineStore("session", (): SessionStore => {
  const toast = useToast();
  const acpAgentsStore = useAcpAgentsStore();
  const sessions = ref<Session[]>([]);
  const activeSessionId = ref<string | null>(null);
  const draftAgentId = ref<string | null>(null);
  const draftProbeByAgent = ref<Map<string, DraftProbeState>>(new Map());
  const isLoading = ref(false);
  const isLoadingMessages = ref(false);
  const activeSession = computed<Session | null>(
    () => sessions.value.find((session) => session.id === activeSessionId.value) ?? null
  );
  const activeDraftProbe = computed<DraftProbeState | null>(() => {
    if (!draftAgentId.value) {
      return null;
    }
    return draftProbeByAgent.value.get(draftAgentId.value) ?? null;
  });
  const effectiveAgentId = computed<string | null>(
    () => activeSession.value?.agentId ?? draftAgentId.value ?? null
  );
  const loadedSessionIds = new Set<string>();
  let ensureDraftProbeTimer: ReturnType<typeof setTimeout> | null = null;

  function syncDraftAgentId(preferredAgentId: string | null = draftAgentId.value): void {
    draftAgentId.value = acpAgentsStore.resolveInstalledAgent(preferredAgentId);
  }

  // Schedule a debounced draft probe for the given agent. Shared by the agent
  // switch watcher and beginDraftSession so entering the draft state always
  // ensures a probe even when effectiveAgentId itself does not change.
  function scheduleDraftProbe(agentId: string | null, projectId: string | null): void {
    if (ensureDraftProbeTimer) {
      clearTimeout(ensureDraftProbeTimer);
      ensureDraftProbeTimer = null;
    }

    if (activeSessionId.value !== null || !agentId || !projectId) {
      return;
    }

    if (draftProbeByAgent.value.has(agentId)) {
      return;
    }

    ensureDraftProbeTimer = setTimeout(() => {
      ensureDraftProbeTimer = null;
      if (activeSessionId.value === null && draftAgentId.value === agentId) {
        void ensureDraftProbe(agentId, projectId);
      }
    }, 200);
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
    // effectiveAgentId may not change when re-entering the draft state with the
    // same agent, so the agent-switch watcher won't fire. Schedule the probe
    // explicitly so the config options bar renders for the carried-over agent.
    scheduleDraftProbe(draftAgentId.value, useProjectStore().currentProject?.id ?? null);
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

  // plan 为运行时态：全量替换，不持久化。SerializedSession / normalizeSession /
  // mergeSessionMeta 都不处理 plan 字段，重启后自然为 undefined。
  function setSessionPlan(sessionId: string, entries: PlanEntry[]): void {
    const session = findSession(sessionId);
    if (!session) {
      return;
    }

    session.plan = entries;
  }

  function setDraftProbe(agentId: string, snapshot: ProbeSnapshot): void {
    draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
      agentId: snapshot.agentId,
      status: snapshot.status,
      acpSessionId: snapshot.acpSessionId,
      configOptions: snapshot.configOptions,
      availableCommands: snapshot.availableCommands,
      error: snapshot.error,
    });
  }

  async function ensureDraftProbe(agentId: string, projectId: string): Promise<void> {
    const starting = new Map(draftProbeByAgent.value);
    starting.set(agentId, {
      agentId,
      status: "starting",
      acpSessionId: null,
      configOptions: [],
      availableCommands: [],
    });
    draftProbeByAgent.value = starting;

    try {
      const result = await chatApi.probeEnsure({ agentId, projectId });
      if (result.ok) {
        setDraftProbe(agentId, result.data);
        return;
      }

      draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
        agentId,
        status: "failed",
        acpSessionId: null,
        configOptions: [],
        availableCommands: [],
        error: result.error,
      });
    } catch (error: unknown) {
      draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
        agentId,
        status: "failed",
        acpSessionId: null,
        configOptions: [],
        availableCommands: [],
        error: {
          code: "PROBE_ENSURE_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async function closeDraftProbe(agentId: string): Promise<void> {
    const next = new Map(draftProbeByAgent.value);
    next.delete(agentId);
    draftProbeByAgent.value = next;
    try {
      await chatApi.probeClose({ agentId });
    } catch {
      // close is best-effort; local draft state has already been cleared.
    }
  }

  function applyProbeUpdate(agentId: string, snapshot: ProbeSnapshot | null): void {
    if (snapshot === null) {
      const next = new Map(draftProbeByAgent.value);
      next.delete(agentId);
      draftProbeByAgent.value = next;
      return;
    }

    setDraftProbe(agentId, snapshot);
  }

  async function setDraftConfigOption(input: {
    agentId: string;
    configId: string;
    type: "select" | "boolean";
    value: string | boolean;
  }): Promise<void> {
    const entry = draftProbeByAgent.value.get(input.agentId);
    const target = entry?.configOptions.find((option) => option.id === input.configId);
    if (!entry || !target) {
      throw new Error(`Config option not found: ${input.configId}`);
    }

    const previousValue = target.currentValue;
    if (target.type === "select" && typeof input.value === "string") {
      target.currentValue = input.value;
    } else if (target.type === "boolean" && typeof input.value === "boolean") {
      target.currentValue = input.value;
    }
    draftProbeByAgent.value = new Map(draftProbeByAgent.value);

    const chatStore = useChatStore();
    chatStore.markConfigOptionPending(input.configId);

    try {
      const result = await chatApi.probeSetConfigOption(input);
      if (!result.ok) {
        throw new Error(result.error.message || result.error.code);
      }
      setDraftProbe(input.agentId, result.data);
    } catch (error: unknown) {
      const rollbackEntry = draftProbeByAgent.value.get(input.agentId);
      const rollbackTarget = rollbackEntry?.configOptions.find(
        (option) => option.id === input.configId
      );
      if (rollbackTarget && rollbackTarget.type === target.type) {
        if (rollbackTarget.type === "select" && typeof previousValue === "string") {
          rollbackTarget.currentValue = previousValue;
        } else if (rollbackTarget.type === "boolean" && typeof previousValue === "boolean") {
          rollbackTarget.currentValue = previousValue;
        }
        draftProbeByAgent.value = new Map(draftProbeByAgent.value);
      }
      toast.add({
        title: "切换 Session 配置失败",
        description: error instanceof Error ? error.message : String(error),
        color: "error",
      });
      throw error;
    } finally {
      chatStore.clearConfigOptionPending(input.configId);
    }
  }

  function subscribeProbeUpdates(): () => void {
    return chatApi.onProbeUpdate(({ agentId, snapshot }) => {
      applyProbeUpdate(agentId, snapshot);
    });
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
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
  }): Promise<Session> {
    const result = await chatApi.createSession({
      projectId: input.projectId,
      title: input.title ?? "New Session",
      agentId: input.agentId,
      ...(input.configOptions !== undefined ? { configOptions: input.configOptions } : {}),
      ...(input.availableCommands !== undefined
        ? { availableCommands: input.availableCommands }
        : {}),
      ...(input.acpSessionId ? { acpSessionId: input.acpSessionId } : {}),
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

    isLoadingMessages.value = true;
    try {
      const projectStore = useProjectStore();
      const projectId = projectStore.currentProject?.id ?? session.projectId;
      const result = await chatApi.loadMessages(sessionId, projectId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      session.messages = result.data.map((message) => normalizeMessage(message));
      loadedSessionIds.add(sessionId);
    } finally {
      isLoadingMessages.value = false;
    }
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

  // Single watcher for the "user changed the active agent" event. All
  // side-effects of an agent switch (capability refresh, draft session
  // probe lifecycle) live here so future additions stay in one place.
  // ChatPromptPanel.vue intentionally has no agent watcher of its own.
  watch(
    () => [effectiveAgentId.value, useProjectStore().currentProject?.id ?? null] as const,
    ([nextAgentId, projectId], oldValues) => {
      const previousAgentId = oldValues?.[0] ?? null;

      if (nextAgentId && nextAgentId !== previousAgentId) {
        void acpAgentsStore.refreshCapabilities(nextAgentId).catch(() => {
          // Capability refresh is best-effort; chat prompt state must keep working if it fails.
        });
      }

      if (previousAgentId && previousAgentId !== nextAgentId) {
        const wasDraft = draftProbeByAgent.value.has(previousAgentId);
        if (wasDraft) {
          void closeDraftProbe(previousAgentId);
        }
      }

      scheduleDraftProbe(nextAgentId, projectId);
    },
    { immediate: true }
  );

  return {
    sessions,
    activeSessionId,
    activeSession,
    draftAgentId,
    draftProbeByAgent,
    activeDraftProbe,
    isLoading,
    isLoadingMessages,
    loadSessions,
    createSession,
    beginDraftSession,
    selectSession,
    renameSession,
    deleteSession,
    setSessionAgent,
    setSessionAvailableCommands,
    setSessionConfigOptions,
    setSessionPlan,
    ensureDraftProbe,
    closeDraftProbe,
    setDraftConfigOption,
    applyProbeUpdate,
    subscribeProbeUpdates,
    setDraftAgent,
    clearSessions,
    sortSessions,
  };
});
