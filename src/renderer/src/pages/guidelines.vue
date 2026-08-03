<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useGuidelinesStore, useWorkspaceStore } from "@renderer/stores";
import { guidelineRefKey, type GuidelineBrowserItem } from "@shared/types/guidelines";

const isDark = useDark();
const workspaceStore = useWorkspaceStore();
const guidelinesStore = useGuidelinesStore();
const selectedRefKey = ref<string | null>(null);

const guidelines = computed(() => guidelinesStore.visibleItems);
const selectedGuideline = computed(() => {
  if (guidelines.value.length === 0) {
    return null;
  }

  return (
    guidelines.value.find((guideline) => guidelineRefKey(guideline.ref) === selectedRefKey.value) ??
    guidelines.value[0]
  );
});
const selectedFolder = computed(
  () =>
    guidelinesStore.folders.find(
      (folder) => folder.folderId === guidelinesStore.selectedFolderId
    ) ?? null
);
const affectedFolderNames = computed(() =>
  guidelinesStore.folders
    .filter((folder) => folder.status !== "ready")
    .map((folder) => folder.folderName)
    .join("、")
);
const filteredEmptyState = computed(() => {
  const folder = selectedFolder.value;
  if (!folder) {
    return {
      title: "暂无项目准则",
      description: "当前范围内所有可用 Project 都没有可读取的 guidelines/**/*.md。",
    };
  }
  if (folder.status === "missing") {
    return {
      title: "Project 不可用",
      description: `${folder.folderName} 当前不存在，未读取该 Project 的项目准则。`,
    };
  }
  if (folder.status === "error") {
    return {
      title: "Project 读取失败",
      description: `${folder.folderName} 的项目准则暂时无法读取。`,
    };
  }
  return {
    title: "此 Project 暂无项目准则",
    description: `${folder.folderName} 的 guidelines 目录下没有可读取的 markdown 文件。`,
  };
});

const selectedMarkdownId = computed(() => {
  const path = selectedGuideline.value?.path ?? "empty";
  return `guideline-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
});

watch(
  () => workspaceStore.currentWorkspace?.id,
  (workspaceId) => {
    selectedRefKey.value = null;
    guidelinesStore.setFolderFilter(null);

    if (workspaceId) {
      void guidelinesStore.load(workspaceId);
    } else {
      guidelinesStore.clear();
    }
  },
  { immediate: true }
);

watch(
  () => (selectedGuideline.value ? guidelineRefKey(selectedGuideline.value.ref) : null),
  (key) => {
    if (key && selectedRefKey.value !== key) {
      selectedRefKey.value = key;
    }
  }
);

function selectGuideline(guideline: GuidelineBrowserItem): void {
  selectedRefKey.value = guidelineRefKey(guideline.ref);
}

function folderStatusLabel(status: "ready" | "missing" | "error"): string {
  return { ready: "可用", missing: "缺失", error: "错误" }[status];
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fallbackDescription(value: string | null): string {
  return value ?? "未声明 description";
}

function guidelineFileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-elevated space-x-2" data-test="guidelines-page">
    <div class="h-full w-72 shrink-0 overflow-hidden rounded-lg bg-default">
      <div class="flex h-full flex-col">
        <div class="border-b border-default/50 px-4 py-3">
          <PageHeader
            eyebrow="Guidelines"
            title="项目准则"
            description="当前 Project 的工程准则。"
          />
          <label v-if="guidelinesStore.data" class="mt-3 block text-xs text-muted">
            <span class="sr-only">按 Project 筛选项目准则</span>
            <select
              :value="guidelinesStore.selectedFolderId ?? ''"
              class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-sm text-highlighted"
              aria-label="按 Project 筛选项目准则"
              data-test="guidelines-folder-filter"
              @change="
                guidelinesStore.setFolderFilter(($event.target as HTMLSelectElement).value || null)
              "
            >
              <option value="">全部 Project</option>
              <option
                v-for="folder in guidelinesStore.folders"
                :key="folder.folderId"
                :value="folder.folderId"
              >
                {{ folder.folderName }} · {{ folderStatusLabel(folder.status) }}
              </option>
            </select>
          </label>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div
            v-if="guidelinesStore.loading"
            class="space-y-2"
            data-test="guidelines-loading-skeleton"
          >
            <div v-for="item in 7" :key="item" class="rounded-lg bg-elevated/70 px-2.5 py-2">
              <USkeleton class="h-4 w-36 rounded" />
              <USkeleton class="mt-2 h-3 w-full rounded" />
              <USkeleton class="mt-2 h-3 w-28 rounded" />
            </div>
          </div>

          <template v-else>
            <UAlert
              v-if="guidelinesStore.data?.completeness === 'partial'"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="部分 Project 未计入"
              :description="affectedFolderNames || '部分 Project 暂不可用。'"
              class="mb-2"
              data-test="guidelines-partial-alert"
            />
            <div
              v-if="guidelinesStore.data"
              class="mb-2 space-y-1"
              data-test="guidelines-folder-statuses"
            >
              <div
                v-for="folder in guidelinesStore.folders"
                :key="folder.folderId"
                class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-muted"
                :aria-label="`${folder.folderName}：${folderStatusLabel(folder.status)}`"
                data-test="guidelines-folder-status"
              >
                <span class="truncate">{{ folder.folderName }}</span>
                <span>{{ folderStatusLabel(folder.status) }}</span>
              </div>
            </div>

            <div v-if="guidelines.length > 0" class="space-y-1" data-test="guidelines-list">
              <UiSurface
                v-for="guideline in guidelines"
                :key="guidelineRefKey(guideline.ref)"
                as="button"
                variant="flat"
                interactive
                padding="none"
                class="w-full px-2.5 py-2 text-left"
                :class="
                  selectedGuideline &&
                  guidelineRefKey(selectedGuideline.ref) === guidelineRefKey(guideline.ref)
                    ? '!bg-primary/15 text-primary ring-1 ring-primary/15'
                    : 'text-default hover:bg-elevated'
                "
                data-test="guidelines-list-item"
                @click="selectGuideline(guideline)"
              >
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-1.5">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ guidelineFileName(guideline.path) }}
                    </p>
                    <UBadge color="neutral" variant="soft" size="sm">
                      {{ guideline.folderName }}
                    </UBadge>
                    <UIcon
                      v-if="guideline.parseError"
                      name="i-lucide-triangle-alert"
                      class="size-3.5 shrink-0 text-warning"
                      aria-label="frontmatter 解析异常"
                    />
                  </div>
                </div>
              </UiSurface>
            </div>
          </template>
        </div>
      </div>
    </div>

    <section class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-default">
      <div
        v-if="guidelinesStore.loading"
        class="flex flex-1 flex-col"
        data-test="guidelines-detail-loading"
      >
        <header class="shrink-0 border-b border-default/50 px-6 py-4">
          <USkeleton class="h-6 w-56 rounded" />
          <USkeleton class="mt-3 h-4 w-2/3 rounded" />
          <USkeleton class="mt-3 h-3 w-80 rounded" />
        </header>
        <div class="flex-1 p-6">
          <USkeleton class="h-5 w-64 rounded" />
          <USkeleton class="mt-4 h-24 w-full rounded" />
          <USkeleton class="mt-6 h-48 w-full rounded" />
        </div>
      </div>

      <div v-else-if="guidelinesStore.error" class="flex flex-1 items-start p-6">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="项目准则加载失败"
          :description="guidelinesStore.error"
          data-test="guidelines-error-alert"
        />
      </div>

      <AppEmptyState
        v-else-if="!selectedGuideline"
        class="flex-1"
        icon="i-lucide-book-marked"
        :title="filteredEmptyState.title"
        :description="filteredEmptyState.description"
        data-test="guidelines-empty-state"
      />

      <template v-else>
        <header class="shrink-0 border-b border-default/50 px-6 py-4">
          <div class="flex items-start justify-between gap-6">
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h2 class="min-w-0 truncate text-xl font-semibold text-highlighted">
                  {{ selectedGuideline.name }}
                </h2>
                <UBadge color="neutral" variant="soft">
                  {{ selectedGuideline.folderName }}
                </UBadge>
                <div
                  v-if="selectedGuideline.keywords?.length"
                  class="flex shrink-0 flex-wrap gap-1.5"
                  data-test="guidelines-keywords"
                >
                  <UBadge
                    v-for="keyword in selectedGuideline.keywords"
                    :key="keyword"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    {{ keyword }}
                  </UBadge>
                </div>
              </div>
              <p class="text-sm leading-relaxed text-muted">
                {{ fallbackDescription(selectedGuideline.description) }}
              </p>
              <div class="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
                <span class="min-w-0 truncate font-mono">{{ selectedGuideline.path }}</span>
                <span>最近更新 {{ formatUpdatedAt(selectedGuideline.updatedAt) }}</span>
              </div>
            </div>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto max-w-3xl px-6 py-6">
            <UAlert
              v-if="selectedGuideline.parseError"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="frontmatter 解析异常"
              :description="selectedGuideline.parseError"
              class="mb-5"
              data-test="guidelines-parse-error"
            />

            <div
              v-if="selectedGuideline.content.trim()"
              class="prose prose-sm dark:prose-invert max-w-none"
              data-test="guidelines-markdown"
            >
              <MarkStream
                :id="selectedMarkdownId"
                :content="selectedGuideline.content"
                :is-streaming="false"
                :is-dark="isDark"
              />
            </div>

            <AppEmptyState
              v-else
              compact
              icon="i-lucide-file-text"
              title="暂无正文"
              description="该 guideline 文件没有 frontmatter 之外的正文内容。"
              data-test="guidelines-content-empty-state"
            />
          </div>
        </div>
      </template>
    </section>
  </div>
</template>
