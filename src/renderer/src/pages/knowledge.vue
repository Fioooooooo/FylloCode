<script setup lang="ts">
import { computed, ref, watch } from "vue";
import KnowledgeBrowserList from "@renderer/components/knowledge/KnowledgeBrowserList.vue";
import KnowledgeDocumentReader from "@renderer/components/knowledge/KnowledgeDocumentReader.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useKnowledgeStore, useProjectStore } from "@renderer/stores";
import { knowledgeSelectableNames } from "@renderer/utils/knowledge-browser";
import { prepareKnowledgeMarkdownForDisplay } from "@renderer/utils/knowledge-markdown";

const projectStore = useProjectStore();
const knowledgeStore = useKnowledgeStore();
const confirm = useConfirmDialog();

const selectedName = ref<string | null>(null);
const rawContent = ref("");
const detailLoading = ref(false);
const detailError = ref<string | null>(null);
const deleteError = ref<string | null>(null);
const deleting = ref(false);
let detailRequestId = 0;

const entries = computed(() => knowledgeStore.data?.entries ?? []);
const errors = computed(() => knowledgeStore.data?.errors ?? []);
const selectableNames = computed(() => knowledgeSelectableNames(entries.value, errors.value));
const selectedEntry = computed(() =>
  entries.value.find((entry) => entry.name === selectedName.value)
);
const selectedIndexError = computed(() =>
  errors.value.find((error) => error.name === selectedName.value)
);
const displayContent = computed(() => prepareKnowledgeMarkdownForDisplay(rawContent.value));

function resetDetail(): void {
  detailRequestId += 1;
  rawContent.value = "";
  detailLoading.value = false;
  detailError.value = null;
  deleteError.value = null;
}

async function selectKnowledge(name: string): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) {
    return;
  }

  selectedName.value = name;
  rawContent.value = "";
  detailError.value = null;
  deleteError.value = null;
  detailLoading.value = true;
  const requestId = ++detailRequestId;

  try {
    const response = await knowledgeStore.readEntry(projectId, { name });
    if (
      requestId !== detailRequestId ||
      projectStore.currentProject?.id !== projectId ||
      selectedName.value !== name
    ) {
      return;
    }

    if (response.ok) {
      rawContent.value = response.data.content;
    } else {
      detailError.value = response.error.message;
    }
  } catch (error: unknown) {
    if (
      requestId === detailRequestId &&
      projectStore.currentProject?.id === projectId &&
      selectedName.value === name
    ) {
      detailError.value = error instanceof Error ? error.message : "知识正文加载失败";
    }
  } finally {
    if (requestId === detailRequestId) {
      detailLoading.value = false;
    }
  }
}

async function loadProjectKnowledge(projectId: string): Promise<void> {
  await knowledgeStore.load(projectId);
  if (projectStore.currentProject?.id !== projectId || knowledgeStore.error) {
    return;
  }

  const firstName = selectableNames.value[0] ?? null;
  if (firstName) {
    await selectKnowledge(firstName);
  }
}

async function deleteSelectedKnowledge(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const name = selectedName.value;
  if (!projectId || !name || deleting.value) {
    return;
  }

  const approved = await confirm({
    title: `删除知识 ${name}？`,
    description: `将永久删除已沉淀知识中的 ${name}.md，此操作不可撤销。`,
    cancelLabel: "取消",
    confirmLabel: "删除知识",
    confirmColor: "error",
  });
  if (!approved) {
    return;
  }

  deleting.value = true;
  deleteError.value = null;
  const previousNames = selectableNames.value;
  const previousIndex = previousNames.indexOf(name);

  try {
    const response = await knowledgeStore.deleteEntry(projectId, { name });
    if (!response.ok) {
      throw new Error(response.error.message);
    }

    await knowledgeStore.load(projectId);
    if (knowledgeStore.error) {
      throw new Error(`知识已删除，但列表刷新失败：${knowledgeStore.error}。请重新打开页面。`);
    }

    const nextNames = selectableNames.value;
    const nextName =
      nextNames[Math.min(previousIndex, nextNames.length - 1)] ??
      nextNames[Math.max(0, previousIndex - 1)] ??
      null;

    selectedName.value = null;
    resetDetail();
    if (nextName) {
      await selectKnowledge(nextName);
    }
  } catch (error: unknown) {
    deleteError.value = `${error instanceof Error ? error.message : "知识删除失败"}，请重试。`;
  } finally {
    deleting.value = false;
  }
}

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    selectedName.value = null;
    resetDetail();

    if (projectId) {
      void loadProjectKnowledge(projectId);
    } else {
      knowledgeStore.clear();
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-1 space-x-2 overflow-hidden bg-elevated" data-test="knowledge-page">
    <aside class="h-full w-72 shrink-0 overflow-hidden rounded-lg bg-default">
      <div class="flex h-full flex-col">
        <div class="border-b border-default/50 px-4 py-3">
          <PageHeader
            eyebrow="Knowledge"
            title="知识沉淀"
            description="浏览、核查当前项目已沉淀的知识。"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <UAlert
            v-if="knowledgeStore.error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="知识沉淀加载失败"
            :description="knowledgeStore.error"
            data-test="knowledge-browser-error"
          />

          <KnowledgeBrowserList
            v-else
            :entries="entries"
            :errors="errors"
            :selected-name="selectedName"
            :loading="knowledgeStore.loading"
            @select="(name) => void selectKnowledge(name)"
          />
        </div>
      </div>
    </aside>

    <KnowledgeDocumentReader
      :name="selectedName"
      :description="selectedEntry?.description ?? null"
      :status="selectedEntry?.status ?? null"
      :content="displayContent"
      :loading="detailLoading"
      :error="detailError"
      :index-error="selectedIndexError?.message ?? null"
      :delete-error="deleteError"
      :deleting="deleting"
      :can-delete="Boolean(selectedName)"
      @delete="void deleteSelectedKnowledge()"
    />
  </div>
</template>
