<script setup lang="ts">
import { useProjectStore } from "@renderer/stores/project";
import { timeAgo } from "@renderer/utils/time";
import type { RecentProject } from "@shared/types/project";

const projectStore = useProjectStore();

const emit = defineEmits<{
  open: [project: RecentProject];
  remove: [projectId: string];
}>();

function handleOpen(project: RecentProject): void {
  emit("open", project);
}

function handleRemove(projectId: string): void {
  emit("remove", projectId);
}
</script>

<template>
  <div class="w-full">
    <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">最近项目</h2>

    <!-- Empty State -->
    <div v-if="projectStore.recentProjects.length === 0" class="text-center text-muted py-8">
      暂无最近项目
    </div>

    <!-- Project List -->
    <div v-else class="max-h-80 overflow-y-auto space-y-1">
      <div
        v-for="project in projectStore.recentProjects"
        :key="project.id"
        class="group flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
        @click="handleOpen(project)"
      >
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-highlighted truncate">
            {{ project.name }}
          </div>
          <div class="text-xs text-muted truncate">{{ project.path }}</div>
        </div>
        <div class="flex items-center gap-3 ml-4">
          <span class="text-xs text-muted whitespace-nowrap">
            {{ timeAgo(project.lastOpenedAt) }}
          </span>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="neutral"
            class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="handleRemove(project.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
