<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useGuidelinesStore } from "@renderer/stores/guidelines";
import { useProjectStore } from "@renderer/stores/project";

const isDark = useDark();
const projectStore = useProjectStore();
const guidelinesStore = useGuidelinesStore();
const selectedPath = ref<string | null>(null);

const guidelines = computed(() => guidelinesStore.data?.items ?? []);
const selectedGuideline = computed(() => {
  if (guidelines.value.length === 0) {
    return null;
  }

  return (
    guidelines.value.find((guideline) => guideline.path === selectedPath.value) ??
    guidelines.value[0]
  );
});

const selectedMarkdownId = computed(() => {
  const path = selectedGuideline.value?.path ?? "empty";
  return `guideline-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
});

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    selectedPath.value = null;

    if (projectId) {
      void guidelinesStore.load(projectId);
    } else {
      guidelinesStore.clear();
    }
  },
  { immediate: true }
);

watch(
  () => selectedGuideline.value?.path ?? null,
  (path) => {
    if (path && selectedPath.value !== path) {
      selectedPath.value = path;
    }
  }
);

function selectGuideline(path: string): void {
  selectedPath.value = path;
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
          <PageHeader eyebrow="Guidelines" title="项目准则" description="当前项目的工程准则。" />
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

          <div v-else-if="guidelines.length > 0" class="space-y-1" data-test="guidelines-list">
            <UiSurface
              v-for="guideline in guidelines"
              :key="guideline.path"
              as="button"
              variant="flat"
              interactive
              padding="none"
              class="w-full px-2.5 py-2 text-left"
              :class="
                selectedGuideline?.path === guideline.path
                  ? '!bg-primary/15 text-primary ring-1 ring-primary/15'
                  : 'text-default hover:bg-elevated'
              "
              data-test="guidelines-list-item"
              @click="selectGuideline(guideline.path)"
            >
              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-1.5">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ guidelineFileName(guideline.path) }}
                  </p>
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
        title="暂无项目准则"
        description="当前项目没有可读取的 guidelines/**/*.md。"
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
