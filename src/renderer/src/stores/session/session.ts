import { computed, ref, watch, type Ref, type ComputedRef } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type {
  AcpAvailableCommand,
  Message,
  AgendaEntry,
  Session,
  TokenUsage,
} from "@shared/types/chat";
import type { FylloActionState } from "@shared/fyllo-action/protocol";
import type { ProbeSnapshot, ProbeStatus } from "@shared/types/chat-probe";
import type { LineageTaskRef } from "@shared/types/lineage";
import type { TaskSource } from "@shared/types/task";
import type { ProposalMeta, ProposalStatusChangedPayload } from "@shared/types/proposal";
import type { SessionWorkspaceFolderSnapshot, WorkspaceFolderInfo } from "@shared/types/workspace";
import { chatApi } from "@renderer/api/session/chat";
import { useAcpAgentsStore } from "../platform/acp-agents";
import { useLineageStore } from "../insight/lineage";
import { useChatStore } from "./chat";
import { useWorkspaceStore } from "../workspace/workspace";
import { useProposalStore } from "../proposal/browser";

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
  fylloSessionId: string | null;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
}

export interface OriginTaskInfo {
  source: TaskSource;
  title: string;
  ref: LineageTaskRef;
}

export interface SessionScopeNameChange {
  folderId: string;
  snapshotName: string;
  currentName: string;
}

export interface SessionScopePathChange {
  folderId: string;
  snapshotPath: string;
  currentPath: string;
}

export interface SessionScopeDiff {
  currentOnly: WorkspaceFolderInfo[];
  snapshotOnly: SessionWorkspaceFolderSnapshot[];
  primaryChanged: boolean;
  nameChanges: SessionScopeNameChange[];
  pathChanges: SessionScopePathChange[];
  unavailableFolderIds: string[];
  hasChanges: boolean;
  isStale: boolean;
}

export interface SessionStore {
  sessions: Ref<Session[]>;
  activeSessionId: Ref<string | null>;
  activeSession: ComputedRef<Session | null>;
  activeSessionScopeDiff: ComputedRef<SessionScopeDiff | null>;
  taskInfoBySessionId: Ref<Map<string, OriginTaskInfo>>;
  draftAgentId: Ref<string | null>;
  draftProbeByAgent: Ref<Map<string, DraftProbeState>>;
  activeDraftProbe: ComputedRef<DraftProbeState | null>;
  sessionProposals: Ref<Record<string, ProposalMeta[]>>;
  isLoading: Ref<boolean>;
  isLoadingMessages: Ref<boolean>;
  loadSessions: (workspaceId: string) => Promise<void>;
  ensureSessionOriginTaskInfo: (session: Session) => Promise<void>;
  getSessionProposals: (sessionId: string) => ProposalMeta[];
  upsertSessionProposal: (sessionId: string, proposal: ProposalMeta) => void;
  removeSessionProposal: (sessionId: string, changeId: string) => void;
  subscribeProposalStatus: () => () => void;
  createSession: (input: {
    workspaceId: string;
    agentId: string;
    title?: string;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
    fylloSessionId?: string;
    taskRef?: LineageTaskRef;
  }) => Promise<Session>;
  beginDraftSession: () => void;
  selectSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  setSessionPinned: (sessionId: string, isPinned: boolean) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  setSessionAgent: (agentId: string) => Promise<void>;
  setSessionAvailableCommands: (sessionId: string, commands: AcpAvailableCommand[]) => void;
  setSessionConfigOptions: (sessionId: string, options: AcpSessionConfigOption[]) => void;
  setSessionActionState: (sessionId: string, actionId: string, state: FylloActionState) => void;
  persistSessionActionState: (
    sessionId: string,
    actionId: string,
    state: FylloActionState
  ) => Promise<void>;
  setSessionAgentAgenda: (sessionId: string, entries: AgendaEntry[]) => void;
  ensureDraftProbe: (agentId: string, workspaceId: string) => Promise<void>;
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
  setSessionOriginTaskRef: (sessionId: string, ref: LineageTaskRef) => void;
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
    isPinned: session.isPinned === true,
    tokenUsage: normalizeTokenUsage(session.tokenUsage),
    createdAt: toDate(session.createdAt),
    updatedAt: toDate(session.updatedAt),
    messages: session.messages.map((message) => normalizeMessage(message)),
  };
}

function sortByUpdatedAt<T extends Pick<Session, "updatedAt">>(items: T[]): T[] {
  return [...items].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

function parseTaskSource(ref: LineageTaskRef): TaskSource {
  return ref.split(":")[0] as TaskSource;
}

function stripArchiveProposalIdPrefix(proposalId: string): string {
  return proposalId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

// Archived proposals are stored with a date prefix (e.g. 2026-07-13-change-id),
// while live lineage links still reference the bare change id. Match both forms
// so sessions correctly surface archived proposal cards after a restart.
function isProposalLinkedToChangeId(proposal: ProposalMeta, changeId: string): boolean {
  return proposal.id === changeId || stripArchiveProposalIdPrefix(proposal.id) === changeId;
}

export const useSessionStore = defineStore("session", (): SessionStore => {
  const toast = useToast();
  const acpAgentsStore = useAcpAgentsStore();
  const lineageStore = useLineageStore();
  const sessions = ref<Session[]>([]);
  const activeSessionId = ref<string | null>(null);
  const taskInfoBySessionId = ref<Map<string, OriginTaskInfo>>(new Map());
  const draftAgentId = ref<string | null>(null);
  const draftProbeByAgent = ref<Map<string, DraftProbeState>>(new Map());
  const sessionProposals = ref<Record<string, ProposalMeta[]>>({});
  let unsubscribeStatusChanged: (() => void) | null = null;
  const isLoading = ref(false);
  const isLoadingMessages = ref(false);
  const activeSession = computed<Session | null>(
    () => sessions.value.find((session) => session.id === activeSessionId.value) ?? null
  );
  const activeSessionScopeDiff = computed<SessionScopeDiff | null>(() => {
    const snapshot = activeSession.value?.workspaceSnapshot;
    const currentWorkspace = useWorkspaceStore().currentWorkspace;
    if (!snapshot || !currentWorkspace || currentWorkspace.id !== snapshot.workspaceId) {
      return null;
    }

    const snapshotById = new Map(snapshot.folders.map((folder) => [folder.folderId, folder]));
    const currentById = new Map(
      currentWorkspace.folders.map((folder) => [folder.folderId, folder])
    );
    const currentOnly = currentWorkspace.folders.filter(
      (folder) => !snapshotById.has(folder.folderId)
    );
    const snapshotOnly = snapshot.folders.filter((folder) => !currentById.has(folder.folderId));
    const nameChanges: SessionScopeNameChange[] = [];
    const pathChanges: SessionScopePathChange[] = [];
    const unavailableFolderIds: string[] = [];

    for (const folder of snapshot.folders) {
      const current = currentById.get(folder.folderId);
      if (!current) continue;
      if (current.folderName !== folder.folderName) {
        nameChanges.push({
          folderId: folder.folderId,
          snapshotName: folder.folderName,
          currentName: current.folderName,
        });
      }
      if (current.folderPath !== folder.folderPath) {
        pathChanges.push({
          folderId: folder.folderId,
          snapshotPath: folder.folderPath,
          currentPath: current.folderPath,
        });
      }
      if (current.pathMissing) {
        unavailableFolderIds.push(folder.folderId);
      }
    }

    const primaryChanged = currentWorkspace.primaryFolderId !== snapshot.primaryFolderId;
    const isStale =
      snapshotOnly.length > 0 || pathChanges.length > 0 || unavailableFolderIds.length > 0;
    return {
      currentOnly,
      snapshotOnly,
      primaryChanged,
      nameChanges,
      pathChanges,
      unavailableFolderIds,
      hasChanges:
        currentOnly.length > 0 ||
        snapshotOnly.length > 0 ||
        primaryChanged ||
        nameChanges.length > 0 ||
        pathChanges.length > 0 ||
        unavailableFolderIds.length > 0,
      isStale,
    };
  });
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
  let sessionsLoadGeneration = 0;
  let ensureDraftProbeTimer: ReturnType<typeof setTimeout> | null = null;

  function syncDraftAgentId(preferredAgentId: string | null = draftAgentId.value): void {
    draftAgentId.value = acpAgentsStore.resolveInstalledAgent(preferredAgentId);
  }

  // Schedule a debounced draft probe for the given agent. Shared by the agent
  // switch watcher and beginDraftSession so entering the draft state always
  // ensures a probe even when effectiveAgentId itself does not change.
  function scheduleDraftProbe(agentId: string | null, workspaceId: string | null): void {
    if (ensureDraftProbeTimer) {
      clearTimeout(ensureDraftProbeTimer);
      ensureDraftProbeTimer = null;
    }

    if (activeSessionId.value !== null || !agentId || !workspaceId) {
      return;
    }

    if (draftProbeByAgent.value.has(agentId)) {
      return;
    }

    ensureDraftProbeTimer = setTimeout(() => {
      ensureDraftProbeTimer = null;
      if (activeSessionId.value === null && draftAgentId.value === agentId) {
        void ensureDraftProbe(agentId, workspaceId);
      }
    }, 200);
  }

  function sortSessions(): void {
    sessions.value = sortByUpdatedAt(sessions.value);
  }

  function setSessionOriginTaskRef(sessionId: string, ref: LineageTaskRef): void {
    const session = findSession(sessionId);
    if (session) {
      session.originTaskRef = ref;
    }

    if (taskInfoBySessionId.value.has(sessionId)) {
      const next = new Map(taskInfoBySessionId.value);
      next.delete(sessionId);
      taskInfoBySessionId.value = next;
    }

    if (session) {
      void ensureSessionOriginTaskInfo(session);
    }
  }

  function getSessionProposals(sessionId: string): ProposalMeta[] {
    return sessionProposals.value[sessionId] ?? [];
  }

  function upsertSessionProposal(sessionId: string, proposal: ProposalMeta): void {
    const list = sessionProposals.value[sessionId] ?? [];
    const index = list.findIndex((item) => item.id === proposal.id);
    if (index >= 0) {
      list[index] = proposal;
    } else {
      list.push(proposal);
    }
    list.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    sessionProposals.value = { ...sessionProposals.value, [sessionId]: list };
  }

  function removeSessionProposal(sessionId: string, changeId: string): void {
    const list = sessionProposals.value[sessionId];
    if (!list) {
      return;
    }
    const filtered = list.filter((item) => item.id !== changeId);
    if (filtered.length === list.length) {
      return;
    }
    sessionProposals.value = { ...sessionProposals.value, [sessionId]: filtered };
  }

  function buildProposalMetaFromPayload(payload: ProposalStatusChangedPayload): ProposalMeta {
    const proposalStore = useProposalStore();
    const existing = proposalStore.proposals.find((item) => item.id === payload.changeId);
    if (existing) {
      return { ...existing, status: payload.status };
    }
    return {
      id: payload.changeId,
      title: payload.changeId,
      status: payload.status,
      why: "",
      totalTasks: 0,
      doneTasks: 0,
      hasDesign: false,
      date: payload.updatedAt,
    };
  }

  function ensureProposalWatched(proposal: ProposalMeta, sessionId: string): void {
    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id;
    if (!workspaceId) {
      return;
    }
    void useProposalStore().watchProposal({ workspaceId, changeId: proposal.id, sessionId });
  }

  async function handleProposalStatusChanged(payload: ProposalStatusChangedPayload): Promise<void> {
    try {
      if (payload.workspaceId !== useWorkspaceStore().currentWorkspace?.id) {
        return;
      }

      if (payload.removed) {
        removeSessionProposal(payload.sessionId, payload.changeId);
        return;
      }

      const proposalStore = useProposalStore();
      const existsInStore = proposalStore.proposals.some((item) => item.id === payload.changeId);
      if (!existsInStore && !proposalStore.loading) {
        await proposalStore.loadProposals();
      }

      const list = sessionProposals.value[payload.sessionId] ?? [];
      const proposal = buildProposalMetaFromPayload(payload);
      if (!list.some((item) => item.id === payload.changeId) && proposal.status !== "archived") {
        // Defensive: if a status push arrives for a proposal we are not yet
        // watching (e.g. after app restart), ensure the watcher is active so
        // future updates are also delivered.
        ensureProposalWatched(proposal, payload.sessionId);
      }
      upsertSessionProposal(payload.sessionId, proposal);
    } catch {
      // Status updates are best-effort; avoid unhandled rejections in the
      // renderer-side event handler.
    }
  }

  function subscribeProposalStatus(): () => void {
    if (unsubscribeStatusChanged) {
      return unsubscribeStatusChanged;
    }

    try {
      unsubscribeStatusChanged = useProposalStore().onStatusChanged((payload) => {
        void handleProposalStatusChanged(payload);
      });
    } catch {
      unsubscribeStatusChanged = () => {};
    }
    return unsubscribeStatusChanged;
  }

  // Hydrate the session's proposal list from lineage links on first activation.
  // This is only a fallback: the real-time status subscription normally drives updates.
  async function backfillSessionProposals(sessionId: string): Promise<void> {
    const existing = sessionProposals.value[sessionId];
    if (existing && existing.length > 0) {
      return;
    }

    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id;
    if (!workspaceId) {
      return;
    }

    const proposalStore = useProposalStore();
    if (proposalStore.proposals.length === 0 && !proposalStore.loading) {
      await proposalStore.loadProposals();
    }

    try {
      const result = await lineageStore.getBySession(workspaceId, sessionId);
      if (!result.ok) {
        return;
      }
      const changeIds = new Set(result.data?.session.proposals.map((link) => link.changeId) ?? []);
      const matched = proposalStore.proposals.filter((item) =>
        [...changeIds].some((changeId) => isProposalLinkedToChangeId(item, changeId))
      );
      if (matched.length > 0) {
        sessionProposals.value = { ...sessionProposals.value, [sessionId]: matched };
        for (const proposal of matched) {
          if (proposal.status !== "archived") {
            ensureProposalWatched(proposal, sessionId);
          }
        }
      }
    } catch {
      // backfill is best-effort; future status pushes will incrementally populate the list
    }
  }

  function findSession(sessionId: string): Session | null {
    return sessions.value.find((session) => session.id === sessionId) ?? null;
  }

  function clearSessions(): void {
    sessionsLoadGeneration += 1;
    isLoading.value = false;
    isLoadingMessages.value = false;
    sessions.value = [];
    activeSessionId.value = null;
    loadedSessionIds.clear();
    taskInfoBySessionId.value = new Map();
    syncDraftAgentId();
  }

  function beginDraftSession(): void {
    const preferredAgentId = activeSession.value?.agentId ?? draftAgentId.value;
    activeSessionId.value = null;
    syncDraftAgentId(preferredAgentId);
    // effectiveAgentId may not change when re-entering the draft state with the
    // same agent, so the agent-switch watcher won't fire. Schedule the probe
    // explicitly so the config options bar renders for the carried-over agent.
    scheduleDraftProbe(draftAgentId.value, useWorkspaceStore().currentWorkspace?.id ?? null);
  }

  function setDraftAgent(agentId: string): void {
    if (!acpAgentsStore.isInstalledAgent(agentId)) {
      return;
    }

    draftAgentId.value = agentId;
  }

  // Update the local session copy's mutable metadata without replacing messages,
  // so optimistic UI state (scroll position, partial message streaming) survives
  // a server round-trip.
  function mergeSessionMeta(nextSession: Session): Session | null {
    const session = sessions.value.find((item) => item.id === nextSession.id);
    if (!session) {
      return null;
    }

    session.workspaceId = nextSession.workspaceId;
    session.agentId = nextSession.agentId;
    session.title = nextSession.title;
    session.isPinned = nextSession.isPinned;
    session.status = nextSession.status;
    session.turnCount = nextSession.turnCount;
    session.tokenUsage = normalizeTokenUsage(nextSession.tokenUsage);
    session.createdAt = nextSession.createdAt;
    session.updatedAt = nextSession.updatedAt;
    session.availableCommands = nextSession.availableCommands;
    session.configOptions = nextSession.configOptions;
    session.actionStates = nextSession.actionStates;
    session.originTaskRef = nextSession.originTaskRef;
    return session;
  }

  function setOriginTaskInfo(sessionId: string, info: OriginTaskInfo): void {
    taskInfoBySessionId.value = new Map(taskInfoBySessionId.value).set(sessionId, info);
  }

  async function ensureSessionOriginTaskInfo(session: Session): Promise<void> {
    const ref = session.originTaskRef;
    if (!ref || taskInfoBySessionId.value.has(session.id)) {
      return;
    }

    const source = parseTaskSource(ref);
    const fallback: OriginTaskInfo = { source, title: ref, ref };
    const workspaceId = useWorkspaceStore().currentWorkspace?.id ?? session.workspaceId;

    try {
      const result = await lineageStore.getByTask(workspaceId, ref);
      if (!result.ok) {
        setOriginTaskInfo(session.id, fallback);
        return;
      }

      setOriginTaskInfo(session.id, {
        source,
        title: result.data?.task?.snapshot.title ?? ref,
        ref,
      });
    } catch {
      setOriginTaskInfo(session.id, fallback);
    }
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

  function setSessionActionState(
    sessionId: string,
    actionId: string,
    state: FylloActionState
  ): void {
    const session = findSession(sessionId);
    if (!session) {
      return;
    }

    session.actionStates = {
      ...(session.actionStates ?? {}),
      [actionId]: state,
    };
  }

  async function persistSessionActionState(
    sessionId: string,
    actionId: string,
    state: FylloActionState
  ): Promise<void> {
    const session = findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    setSessionActionState(sessionId, actionId, state);
  }

  // agentAgenda 为运行时态：全量替换，不持久化。SerializedSession / normalizeSession /
  // mergeSessionMeta 都不处理 agentAgenda 字段，重启后自然为 undefined。
  function setSessionAgentAgenda(sessionId: string, entries: AgendaEntry[]): void {
    const session = findSession(sessionId);
    if (!session) {
      return;
    }

    session.agentAgenda = entries;
  }

  function setDraftProbe(agentId: string, snapshot: ProbeSnapshot): void {
    draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
      agentId: snapshot.agentId,
      status: snapshot.status,
      fylloSessionId: snapshot.fylloSessionId,
      acpSessionId: snapshot.acpSessionId,
      configOptions: snapshot.configOptions,
      availableCommands: snapshot.availableCommands,
      error: snapshot.error,
    });
  }

  async function ensureDraftProbe(agentId: string, workspaceId: string): Promise<void> {
    const starting = new Map(draftProbeByAgent.value);
    starting.set(agentId, {
      agentId,
      status: "starting",
      fylloSessionId: null,
      acpSessionId: null,
      configOptions: [],
      availableCommands: [],
    });
    draftProbeByAgent.value = starting;

    try {
      const result = await chatApi.probeEnsure({ agentId, workspaceId });
      if (result.ok) {
        setDraftProbe(agentId, result.data);
        return;
      }

      draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
        agentId,
        status: "failed",
        fylloSessionId: null,
        acpSessionId: null,
        configOptions: [],
        availableCommands: [],
        error: result.error,
      });
    } catch (error: unknown) {
      draftProbeByAgent.value = new Map(draftProbeByAgent.value).set(agentId, {
        agentId,
        status: "failed",
        fylloSessionId: null,
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
    const workspaceId = useWorkspaceStore().currentWorkspace?.id;
    if (!workspaceId) {
      return;
    }

    try {
      await chatApi.probeClose({ workspaceId, agentId });
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
    const workspaceId = useWorkspaceStore().currentWorkspace?.id;
    if (!workspaceId) {
      throw new Error("Project is required to set draft config options");
    }

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
      const result = await chatApi.probeSetConfigOption({ ...input, workspaceId });
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
    return chatApi.onProbeUpdate(({ workspaceId, agentId, snapshot }) => {
      if (workspaceId !== useWorkspaceStore().currentWorkspace?.id) {
        return;
      }

      applyProbeUpdate(agentId, snapshot);
    });
  }

  async function loadSessions(workspaceId: string): Promise<void> {
    const requestGeneration = ++sessionsLoadGeneration;
    isLoading.value = true;

    try {
      const result = await chatApi.listSessions({ workspaceId });
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      if (
        requestGeneration !== sessionsLoadGeneration ||
        useWorkspaceStore().currentWorkspace?.id !== workspaceId
      ) {
        return;
      }

      loadedSessionIds.clear();
      sessions.value = sortByUpdatedAt(result.data.map((session) => normalizeSession(session)));
      activeSessionId.value = null;
      syncDraftAgentId();
    } finally {
      if (
        requestGeneration === sessionsLoadGeneration &&
        useWorkspaceStore().currentWorkspace?.id === workspaceId
      ) {
        isLoading.value = false;
      }
    }
  }

  async function createSession(input: {
    workspaceId: string;
    agentId: string;
    title?: string;
    configOptions?: AcpSessionConfigOption[];
    availableCommands?: AcpAvailableCommand[];
    acpSessionId?: string;
    fylloSessionId?: string;
    taskRef?: LineageTaskRef;
  }): Promise<Session> {
    const result = await chatApi.createSession({
      workspaceId: input.workspaceId,
      title: input.title ?? "New Session",
      agentId: input.agentId,
      ...(input.configOptions !== undefined ? { configOptions: input.configOptions } : {}),
      ...(input.availableCommands !== undefined
        ? { availableCommands: input.availableCommands }
        : {}),
      ...(input.acpSessionId ? { acpSessionId: input.acpSessionId } : {}),
      ...(input.fylloSessionId ? { fylloSessionId: input.fylloSessionId } : {}),
      ...(input.taskRef ? { taskRef: input.taskRef } : {}),
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const session = normalizeSession(result.data);
    if (useWorkspaceStore().currentWorkspace?.id !== input.workspaceId) {
      return session;
    }
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)];
    activeSessionId.value = session.id;
    loadedSessionIds.add(session.id);
    // createSession 不经过 selectSession，需主动填充任务信息，否则首次发起讨论时
    // OriginTaskBanner 拿不到 taskInfoBySessionId，要等重新加载 sessionList 才显示。
    void ensureSessionOriginTaskInfo(session);
    return findSession(session.id) ?? session;
  }

  async function selectSession(sessionId: string): Promise<void> {
    const session = sessions.value.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    activeSessionId.value = sessionId;
    await ensureSessionOriginTaskInfo(session);

    if (session.messages.length > 0 || loadedSessionIds.has(sessionId)) {
      return;
    }

    isLoadingMessages.value = true;
    try {
      const workspaceStore = useWorkspaceStore();
      const workspaceId = workspaceStore.currentWorkspace?.id ?? session.workspaceId;
      const result = await chatApi.loadMessages(sessionId, workspaceId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      if (
        useWorkspaceStore().currentWorkspace?.id !== workspaceId ||
        sessions.value.find((item) => item.id === sessionId) !== session
      ) {
        return;
      }

      session.messages = result.data.map((message) => normalizeMessage(message));
      loadedSessionIds.add(sessionId);
    } finally {
      isLoadingMessages.value = false;
    }
  }

  async function renameSession(sessionId: string, title: string): Promise<void> {
    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id;
    if (!workspaceId) {
      throw new Error("Cannot rename session without an active Workspace");
    }

    const result = await chatApi.updateSession(sessionId, { title }, workspaceId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    mergeSessionMeta(normalizeSession(result.data));
    sortSessions();
  }

  async function setSessionPinned(sessionId: string, isPinned: boolean): Promise<void> {
    const session = findSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const workspaceId = useWorkspaceStore().currentWorkspace?.id ?? session.workspaceId;
    const actionLabel = isPinned ? "置顶会话" : "取消置顶";

    try {
      const result = await chatApi.updateSession(sessionId, { isPinned }, workspaceId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      mergeSessionMeta(normalizeSession(result.data));
    } catch (error: unknown) {
      toast.add({
        title: `${actionLabel}失败`,
        description: error instanceof Error ? error.message : String(error),
        color: "error",
      });
      throw error;
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id;
    if (!workspaceId) {
      throw new Error("Cannot delete session without an active Workspace");
    }

    const result = await chatApi.removeSession(sessionId, workspaceId);
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

    const workspaceStore = useWorkspaceStore();
    const workspaceId = workspaceStore.currentWorkspace?.id ?? session.workspaceId;
    const result = await chatApi.updateSession(session.id, { agentId }, workspaceId);
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
    () => [effectiveAgentId.value, useWorkspaceStore().currentWorkspace?.id ?? null] as const,
    ([nextAgentId, workspaceId], oldValues) => {
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

      scheduleDraftProbe(nextAgentId, workspaceId);
    },
    { immediate: true }
  );

  watch(
    () => activeSession.value?.id ?? null,
    (sessionId) => {
      if (sessionId) {
        void backfillSessionProposals(sessionId);
      }
    }
  );

  subscribeProposalStatus();

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeSessionScopeDiff,
    taskInfoBySessionId,
    draftAgentId,
    draftProbeByAgent,
    activeDraftProbe,
    sessionProposals,
    isLoading,
    isLoadingMessages,
    loadSessions,
    ensureSessionOriginTaskInfo,
    getSessionProposals,
    upsertSessionProposal,
    removeSessionProposal,
    subscribeProposalStatus,
    createSession,
    beginDraftSession,
    selectSession,
    renameSession,
    setSessionPinned,
    deleteSession,
    setSessionAgent,
    setSessionAvailableCommands,
    setSessionConfigOptions,
    setSessionActionState,
    persistSessionActionState,
    setSessionAgentAgenda,
    ensureDraftProbe,
    closeDraftProbe,
    setDraftConfigOption,
    applyProbeUpdate,
    subscribeProbeUpdates,
    setDraftAgent,
    clearSessions,
    sortSessions,
    setSessionOriginTaskRef,
  };
});
