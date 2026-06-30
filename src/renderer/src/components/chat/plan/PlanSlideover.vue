<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { lineageApi } from "@renderer/api/lineage";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import type { PlanDocument } from "@shared/types/lineage";

export type PlanSlideoverMode = "review" | "readonly";
export type PlanSlideoverResult = { status: "approved" } | { status: "dismissed" };

const props = withDefaults(
  defineProps<{
    sessionId: string;
    slug: string;
    mode?: PlanSlideoverMode;
  }>(),
  {
    mode: "review",
  }
);

const emit = defineEmits<{
  close: [result: PlanSlideoverResult];
}>();

const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const chatStore = useChatStore();

const planDocument = ref<PlanDocument | null>(null);
const body = ref("");
const lastSavedBody = ref("");
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const approving = ref(false);
const saving = ref(false);
const loaded = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePromise: Promise<void> | null = null;

const projectId = computed(() => projectStore.currentProject?.id ?? "");
const isReadonly = computed(() => props.mode === "readonly");
const dirty = computed(() => body.value !== lastSavedBody.value);
const statusColor = computed(() =>
  planDocument.value?.status === "approved" ? "success" : "neutral"
);

function getProjectId(): string {
  if (!projectId.value) {
    throw new Error("当前没有选中的项目");
  }
  return projectId.value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadPlan(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  saveError.value = null;
  loaded.value = false;

  try {
    const result = await lineageApi.readPlan(getProjectId(), {
      sessionId: props.sessionId,
      slug: props.slug,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    planDocument.value = result.data;
    body.value = result.data.body;
    lastSavedBody.value = result.data.body;
    loaded.value = true;
  } catch (error: unknown) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function saveSnapshot(snapshot: string): Promise<void> {
  const result = await lineageApi.savePlanBody(getProjectId(), {
    sessionId: props.sessionId,
    slug: props.slug,
    body: snapshot,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  planDocument.value = result.data;
  lastSavedBody.value = snapshot;
}

async function saveNow(): Promise<void> {
  if (isReadonly.value || !loaded.value || body.value === lastSavedBody.value) {
    return;
  }

  if (savePromise) {
    await savePromise;
  }

  if (body.value === lastSavedBody.value) {
    return;
  }

  const snapshot = body.value;
  saving.value = true;
  saveError.value = null;
  savePromise = saveSnapshot(snapshot)
    .catch((error: unknown) => {
      saveError.value = getErrorMessage(error);
      throw error;
    })
    .finally(() => {
      saving.value = false;
      savePromise = null;
    });
  await savePromise;
}

function scheduleSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    void saveNow();
  }, 700);
}

async function handleClose(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    await saveNow();
    emit("close", { status: "dismissed" });
  } catch {
    // Keep the slideover open so the user can retry or copy unsaved edits.
  }
}

async function approve(): Promise<void> {
  if (approving.value || loading.value) {
    return;
  }

  approving.value = true;
  saveError.value = null;

  try {
    if (sessionStore.activeSessionId !== props.sessionId) {
      throw new Error("当前聊天会话已切换，无法确认该规划。");
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveNow();

    const result = await lineageApi.approvePlan(getProjectId(), {
      sessionId: props.sessionId,
      slug: props.slug,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    planDocument.value = result.data;
    await chatStore.sendMessage([{ type: "text", text: `我已确认规划方案：${props.slug}` }]);
    emit("close", { status: "approved" });
  } catch (error: unknown) {
    saveError.value = getErrorMessage(error);
  } finally {
    approving.value = false;
  }
}

watch(body, () => {
  if (!loaded.value || isReadonly.value || body.value === lastSavedBody.value) {
    return;
  }
  scheduleSave();
});

onMounted(() => {
  void loadPlan();
});

onUnmounted(() => {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
});
</script>

<template>
  <USlideover
    :close="false"
    :ui="{
      content: 'w-[min(100vw,920px)] max-w-none',
      body: 'h-full min-h-0 p-0 sm:p-0',
      footer: 'justify-between',
    }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col bg-default">
        <header class="border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-highlighted">规划审阅</h2>
                <UBadge :color="statusColor" variant="soft" size="xs">
                  {{ planDocument?.status === "approved" ? "已批准" : "草稿" }}
                </UBadge>
                <UBadge v-if="dirty" color="warning" variant="soft" size="xs">未保存</UBadge>
                <UBadge v-else-if="saving" color="primary" variant="soft" size="xs">保存中</UBadge>
              </div>
              <p class="break-all font-mono text-xs text-muted">{{ props.slug }}</p>
              <p v-if="planDocument?.goal" class="text-sm leading-5 text-muted">
                {{ planDocument.goal }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="关闭"
              @click="void handleClose()"
            />
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div
            v-if="loading"
            class="flex items-center gap-2 text-sm text-muted"
            data-test="plan-loading"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            <span>正在加载规划</span>
          </div>

          <p v-else-if="loadError" class="text-sm text-error" data-test="plan-load-error">
            {{ loadError }}
          </p>

          <UTextarea
            v-else
            v-model="body"
            data-test="plan-body-editor"
            class="min-h-[520px] w-full font-mono text-sm leading-6"
            :rows="24"
            :readonly="isReadonly"
            autoresize
            content-type="markdown"
          />
        </div>

        <footer
          class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-5 py-3"
        >
          <p class="min-w-0 text-xs text-muted">
            <span v-if="saveError" class="text-error">{{ saveError }}</span>
            <span v-else-if="saving">正在保存正文</span>
            <span v-else-if="dirty">正文尚未保存</span>
            <span v-else>正文已保存</span>
          </p>

          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="outline" @click="void handleClose()">关闭</UButton>
            <UButton
              v-if="!isReadonly"
              color="primary"
              :loading="approving"
              :disabled="loading || Boolean(loadError)"
              @click="void approve()"
            >
              确认
            </UButton>
          </div>
        </footer>
      </div>
    </template>
  </USlideover>
</template>
