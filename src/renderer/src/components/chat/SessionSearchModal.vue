<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { chatApi } from "@renderer/api/session/chat";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";
import { useWorkspaceStore } from "@renderer/stores";
import type { SessionSearchResult } from "@shared/types/chat";

type SearchStatus = "idle" | "debouncing" | "loading" | "results" | "empty" | "error";

interface SearchRequest {
  generation: number;
  query: string;
  workspaceId: string;
}

interface InputComponentRef {
  $el?: Element;
  inputRef?: HTMLInputElement;
}

const open = defineModel<boolean>("open", { default: false });
const workspaceStore = useWorkspaceStore();
const { openChatSession } = useOpenChatSession();
const query = ref("");
const results = ref<SessionSearchResult[]>([]);
const status = ref<SearchStatus>("idle");
const errorMessage = ref("");
const openErrorMessage = ref("");
const openingSessionId = ref<string | null>(null);
const searchInput = ref<InputComponentRef | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let requestInFlight = false;
let pendingRequest: SearchRequest | null = null;

const isSearching = computed(() => status.value === "debouncing" || status.value === "loading");

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function currentWorkspaceId(): string | null {
  return workspaceStore.currentWorkspace?.id ?? null;
}

function isCurrentRequest(request: SearchRequest): boolean {
  return (
    open.value &&
    request.generation === generation &&
    request.workspaceId === currentWorkspaceId() &&
    request.query === query.value.trim()
  );
}

function focusInput(): void {
  const exposedInput = searchInput.value?.inputRef;
  if (exposedInput) {
    exposedInput.focus();
    return;
  }

  const root = searchInput.value?.$el;
  if (root instanceof HTMLInputElement) {
    root.focus();
  } else {
    root?.querySelector("input")?.focus();
  }
}

function resetSearch(): void {
  generation += 1;
  clearDebounce();
  pendingRequest = null;
  query.value = "";
  results.value = [];
  errorMessage.value = "";
  openErrorMessage.value = "";
  openingSessionId.value = null;
  status.value = "idle";
}

async function executeSearch(request: SearchRequest): Promise<void> {
  if (!isCurrentRequest(request)) {
    return;
  }

  requestInFlight = true;
  status.value = "loading";
  errorMessage.value = "";

  try {
    const response = await chatApi.searchSessions({
      workspaceId: request.workspaceId,
      query: request.query,
    });
    if (!response.ok) {
      throw new Error(response.error.message);
    }

    if (isCurrentRequest(request)) {
      results.value = response.data;
      status.value = response.data.length > 0 ? "results" : "empty";
    }
  } catch (error: unknown) {
    if (isCurrentRequest(request)) {
      results.value = [];
      errorMessage.value = error instanceof Error ? error.message : String(error);
      status.value = "error";
    }
  } finally {
    requestInFlight = false;
    const nextRequest = pendingRequest;
    pendingRequest = null;
    if (nextRequest && isCurrentRequest(nextRequest)) {
      await executeSearch(nextRequest);
    }
  }
}

function enqueueSearch(request: SearchRequest): void {
  if (!isCurrentRequest(request)) {
    return;
  }
  if (requestInFlight) {
    pendingRequest = request;
    return;
  }
  void executeSearch(request);
}

function scheduleSearch(delay = 300): void {
  clearDebounce();
  pendingRequest = null;
  generation += 1;
  results.value = [];
  errorMessage.value = "";

  const trimmedQuery = query.value.trim();
  const workspaceId = currentWorkspaceId();
  if (!trimmedQuery || !workspaceId || !open.value) {
    status.value = "idle";
    return;
  }

  status.value = "debouncing";
  const request: SearchRequest = { generation, query: trimmedQuery, workspaceId };
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    enqueueSearch(request);
  }, delay);
}

function retrySearch(): void {
  scheduleSearch(0);
}

async function handleOpenResult(sessionId: string): Promise<void> {
  if (openingSessionId.value) {
    return;
  }

  openingSessionId.value = sessionId;
  openErrorMessage.value = "";
  try {
    await openChatSession(sessionId);
    open.value = false;
  } catch (error: unknown) {
    openErrorMessage.value =
      error instanceof Error ? error.message : "无法打开这个会话，请重新搜索后再试。";
  } finally {
    openingSessionId.value = null;
  }
}

function formatUpdatedAt(updatedAt: Date): string {
  return new Date(updatedAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

watch(query, () => {
  scheduleSearch();
});

watch(open, (isOpen) => {
  if (!isOpen) {
    resetSearch();
    return;
  }

  resetSearch();
  void nextTick(focusInput);
});

watch(
  () => workspaceStore.currentWorkspace?.id,
  () => {
    if (open.value) {
      resetSearch();
      void nextTick(focusInput);
    } else {
      generation += 1;
      clearDebounce();
      pendingRequest = null;
    }
  }
);

onBeforeUnmount(() => {
  generation += 1;
  clearDebounce();
  pendingRequest = null;
});
</script>

<template>
  <UModal
    v-model:open="open"
    title="搜索会话"
    description="搜索当前 Workspace 的会话标题、Session ID 和对话正文。"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UInput
          ref="searchInput"
          v-model="query"
          icon="i-lucide-search"
          placeholder="输入关键词…"
          autofocus
          class="w-full"
          aria-label="搜索会话关键词"
          data-test="session-search-input"
        />

        <div class="min-h-56" aria-live="polite" data-test="session-search-content">
          <AppEmptyState
            v-if="status === 'idle'"
            icon="i-lucide-search"
            title="输入关键词搜索会话"
            description="可搜索会话标题、Session ID，以及用户和 Assistant 的对话正文。"
            compact
            class="py-10"
            data-test="session-search-idle"
          />

          <div
            v-else-if="isSearching"
            class="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted"
            data-test="session-search-loading"
          >
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
            <span>正在搜索会话…</span>
          </div>

          <AppEmptyState
            v-else-if="status === 'empty'"
            icon="i-lucide-search-x"
            title="没有匹配的会话"
            description="尝试更换关键词。"
            compact
            class="py-10"
            data-test="session-search-empty"
          />

          <AppEmptyState
            v-else-if="status === 'error'"
            icon="i-lucide-circle-alert"
            title="搜索失败"
            :description="errorMessage || '请稍后重试。'"
            action-label="重新搜索"
            action-icon="i-lucide-refresh-cw"
            compact
            class="py-10"
            data-test="session-search-error"
            @action="retrySearch"
          />

          <div
            v-else
            class="max-h-96 space-y-1 overflow-y-auto pr-1"
            data-test="session-search-results"
          >
            <div
              v-if="openErrorMessage"
              role="alert"
              class="mb-2 flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error"
              data-test="session-search-open-error"
            >
              <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
              <span>{{ openErrorMessage }}</span>
            </div>
            <button
              v-for="result in results"
              :key="result.sessionId"
              type="button"
              class="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
              :disabled="openingSessionId !== null"
              :aria-busy="openingSessionId === result.sessionId"
              :data-test="`session-search-result-${result.sessionId}`"
              @click="
                void handleOpenResult(result.sessionId).catch((error: unknown) => {
                  console.error('Failed to open search result:', error);
                })
              "
            >
              <div class="flex min-w-0 items-center gap-3">
                <UIcon name="i-lucide-message-circle-more" class="size-4 shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate text-sm font-medium text-highlighted">
                      {{ result.title }}
                    </span>
                    <span class="shrink-0 text-xs text-dimmed">
                      {{ formatUpdatedAt(result.updatedAt) }}
                    </span>
                  </div>
                  <p v-if="result.snippet" class="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {{ result.snippet }}
                  </p>
                  <p v-else class="mt-1 truncate font-mono text-xs text-dimmed">
                    {{ result.sessionId }}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
