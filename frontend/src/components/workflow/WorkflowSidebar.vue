<script setup lang="ts">
import type { WorkflowTemplate } from "@shared/types/workflow";

defineProps<{
  customTemplates: WorkflowTemplate[];
  builtInTemplates: WorkflowTemplate[];
  selectedTemplateId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  create: [];
}>();

function stageSummary(template: WorkflowTemplate): string {
  const names = template.stages.map((stage) => stage.name).filter(Boolean);
  return names.length > 0 ? names.join(" -> ") : "未配置阶段";
}
</script>

<template>
  <aside class="w-65 shrink-0 border-r border-default bg-default flex flex-col">
    <div class="flex-1 overflow-y-auto py-2">
      <section>
        <div class="flex items-center justify-between gap-2 px-3 py-1">
          <p class="text-xs font-medium text-muted">自定义</p>
          <UTooltip text="新建模板" :delay-duration="200">
            <UButton variant="ghost" color="neutral" size="xs" square @click="emit('create')">
              <UIcon name="i-lucide-plus" class="w-4 h-4" />
            </UButton>
          </UTooltip>
        </div>

        <p v-if="loading" class="px-3 py-3 text-xs text-muted">加载中...</p>
        <p v-else-if="customTemplates.length === 0" class="px-3 py-3 text-xs text-muted">
          暂无自定义模板
        </p>

        <button
          v-for="template in customTemplates"
          :key="template.id"
          type="button"
          class="mx-2 px-3 py-2.5 rounded-md cursor-pointer hover:bg-accented transition-colors w-[calc(100%-1rem)] text-left"
          :class="selectedTemplateId === template.id ? 'bg-accented' : 'bg-transparent'"
          @click="emit('select', template.id)"
        >
          <span class="block text-sm font-medium text-highlighted truncate">
            {{ template.name }}
          </span>
          <p class="text-xs text-muted mt-0.5 truncate">{{ stageSummary(template) }}</p>
        </button>
      </section>

      <section class="mt-3">
        <p class="px-3 py-1 text-xs font-medium text-muted">内置</p>

        <p v-if="loading" class="px-3 py-3 text-xs text-muted">加载中...</p>
        <p v-else-if="builtInTemplates.length === 0" class="px-3 py-3 text-xs text-muted">
          暂无内置模板
        </p>

        <button
          v-for="template in builtInTemplates"
          :key="template.id"
          type="button"
          class="mx-2 px-3 py-2.5 rounded-md cursor-pointer hover:bg-accented transition-colors w-[calc(100%-1rem)] text-left"
          :class="selectedTemplateId === template.id ? 'bg-accented' : 'bg-transparent'"
          @click="emit('select', template.id)"
        >
          <span class="block text-sm font-medium text-highlighted truncate">
            {{ template.name }}
          </span>
          <p class="text-xs text-muted mt-0.5 truncate">{{ stageSummary(template) }}</p>
        </button>
      </section>
    </div>
  </aside>
</template>
