<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useKnowledgeStore, useProjectStore, useSessionStore } from "@renderer/stores";
import type { KnowledgeEntryDocument } from "@shared/types/knowledge";

export type KnowledgeReviewSlideoverResult = { status: "approved" } | { status: "dismissed" };

const props = defineProps<{
  sessionId: string;
  name: string;
}>();

const emit = defineEmits<{
  close: [result: KnowledgeReviewSlideoverResult];
}>();

const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const knowledgeStore = useKnowledgeStore();

const document = ref<KnowledgeEntryDocument | null>(null);
const content = ref("");
const lastSavedContent = ref("");
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const approving = ref(false);
const saving = ref(false);
const loaded = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePromise: Promise<void> | null = null;

const projectId = computed(() => projectStore.currentProject?.id ?? "");
const dirty = computed(() => content.value !== lastSavedContent.value);

function getProjectId(): string {
  if (!projectId.value) {
    throw new Error("当前没有选中的项目");
  }
  return projectId.value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadEntry(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  saveError.value = null;
  loaded.value = false;

  try {
    const result = await knowledgeStore.readEntry(getProjectId(), {
      name: props.name,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    document.value = result.data;
    content.value = result.data.content;
    lastSavedContent.value = result.data.content;
    loaded.value = true;
  } catch (error: unknown) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function saveSnapshot(snapshot: string): Promise<void> {
  const result = await knowledgeStore.saveEntry(getProjectId(), {
    name: props.name,
    content: snapshot,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  document.value = result.data;
  lastSavedContent.value = snapshot;
}

async function saveNow(): Promise<void> {
  if (!loaded.value || content.value === lastSavedContent.value) {
    return;
  }

  if (savePromise) {
    await savePromise;
  }

  if (content.value === lastSavedContent.value) {
    return;
  }

  const snapshot = content.value;
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
      throw new Error("当前聊天会话已切换，无法确认该知识。");
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveNow();
    emit("close", { status: "approved" });
  } catch (error: unknown) {
    saveError.value = getErrorMessage(error);
  } finally {
    approving.value = false;
  }
}

watch(content, () => {
  if (!loaded.value || content.value === lastSavedContent.value) {
    return;
  }
  scheduleSave();
});

onMounted(() => {
  void loadEntry();
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
                <h2 class="truncate text-base font-semibold text-highlighted">知识审阅</h2>
                <UBadge v-if="dirty" color="warning" variant="soft" size="xs">未保存</UBadge>
                <UBadge v-else-if="saving" color="primary" variant="soft" size="xs">保存中</UBadge>
              </div>
              <p class="break-all font-mono text-xs text-muted">{{ props.name }}.md</p>
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
            data-test="knowledge-loading"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            <span>正在加载知识</span>
          </div>

          <p v-else-if="loadError" class="text-sm text-error" data-test="knowledge-load-error">
            {{ loadError }}
          </p>

          <UTextarea
            v-else
            v-model="content"
            data-test="knowledge-body-editor"
            class="min-h-[520px] w-full font-mono text-sm leading-6"
            :rows="24"
            autoresize
            content-type="markdown"
          />
        </div>

        <footer
          class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-5 py-3"
        >
          <p class="min-w-0 text-xs text-muted">
            <span v-if="saveError" class="text-error">{{ saveError }}</span>
            <span v-else-if="saving">正在沉淀知识</span>
            <span v-else-if="dirty">知识尚未沉淀</span>
            <span v-else>知识已沉淀</span>
          </p>

          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="outline" @click="void handleClose()">关闭</UButton>
            <UButton
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
