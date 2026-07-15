<script setup lang="ts">
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import type { KnowledgeComputedStatus } from "@shared/types/knowledge";

defineProps<{
  name: string | null;
  description: string | null;
  status: KnowledgeComputedStatus | null;
  content: string;
  loading: boolean;
  error: string | null;
  indexError: string | null;
  deleteError: string | null;
  deleting: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  delete: [];
}>();

const isDark = useDark();

const statusColor: Record<KnowledgeComputedStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspect: "warning",
  unknown: "neutral",
};
</script>

<template>
  <section
    class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-default"
    data-test="knowledge-document-reader"
  >
    <template v-if="name">
      <header class="shrink-0 border-b border-default/50 px-6 py-4">
        <div class="flex items-start justify-between gap-6">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h2 class="min-w-0 truncate text-xl font-semibold text-highlighted">{{ name }}</h2>
              <UBadge v-if="status" :color="statusColor[status]" variant="soft" size="sm">
                {{ status }}
              </UBadge>
            </div>
            <p v-if="description" class="text-sm leading-relaxed text-muted">{{ description }}</p>
            <p class="break-all font-mono text-xs text-muted">{{ name }}.md</p>
          </div>

          <UButton
            v-if="canDelete"
            icon="i-lucide-trash-2"
            color="error"
            variant="soft"
            :loading="deleting"
            :disabled="deleting"
            aria-label="删除知识"
            data-test="knowledge-delete-button"
            size="sm"
            @click="emit('delete')"
          >
            删除知识
          </UButton>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-3xl px-6 py-6">
          <UAlert
            v-if="indexError"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="该知识无法正常索引"
            :description="indexError"
            class="mb-5"
            data-test="knowledge-index-error"
          />

          <UAlert
            v-if="deleteError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="知识删除失败"
            :description="deleteError"
            class="mb-5"
            data-test="knowledge-delete-error"
          />

          <div
            v-if="loading"
            class="flex items-center gap-2 py-12 text-sm text-muted"
            data-test="knowledge-detail-loading"
          >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            <span>正在加载知识…</span>
          </div>

          <UAlert
            v-else-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="知识正文加载失败"
            :description="error"
            data-test="knowledge-detail-error"
          />

          <div
            v-else-if="content.trim()"
            class="prose prose-sm dark:prose-invert max-w-none"
            data-test="knowledge-markdown"
          >
            <MarkStream
              :id="`knowledge-${name}`"
              :content="content"
              :is-streaming="false"
              :is-dark="isDark"
              :enable-actions="false"
            />
          </div>

          <AppEmptyState
            v-else
            compact
            icon="i-lucide-file-text"
            title="暂无正文"
            description="该 knowledge 文件没有可展示的 Markdown 内容。"
            data-test="knowledge-detail-empty"
          />
        </div>
      </div>
    </template>

    <AppEmptyState
      v-else
      class="flex-1"
      icon="i-lucide-brain"
      title="暂无知识沉淀"
      description="项目中的 durable knowledge 会在这里集中展示。"
      data-test="knowledge-page-empty"
    />
  </section>
</template>
