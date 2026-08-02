<script setup lang="ts">
import { useWorkspaceStore } from "@renderer/stores";
import { timeAgo } from "@renderer/utils/time";
import type { WorkspaceInfo } from "@shared/types/workspace";

const workspaceStore = useWorkspaceStore();

const emit = defineEmits<{
  open: [workspace: WorkspaceInfo];
  remove: [workspaceId: string];
}>();

function handleOpen(workspace: WorkspaceInfo): void {
  emit("open", workspace);
}

function handleRemove(workspaceId: string): void {
  emit("remove", workspaceId);
}
</script>

<template>
  <div class="w-full">
    <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">最近工作区</h2>

    <!-- Empty State -->
    <div v-if="workspaceStore.recentWorkspaces.length === 0" class="text-center text-muted py-8">
      暂无最近工作区
    </div>

    <!-- Project List -->
    <div v-else class="max-h-80 overflow-y-auto space-y-1">
      <div
        v-for="workspace in workspaceStore.recentWorkspaces"
        :key="workspace.id"
        class="group flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer hover:bg-elevated transition-colors"
        @click="handleOpen(workspace)"
      >
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-highlighted truncate">
            {{ workspace.name }}
          </div>
          <div class="text-xs text-muted truncate">{{ workspace.primaryFolder.path }}</div>
        </div>
        <div class="flex items-center gap-3 ml-4">
          <span class="text-xs text-muted whitespace-nowrap">
            {{ timeAgo(workspace.lastOpenedAt) }}
          </span>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="neutral"
            class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="handleRemove(workspace.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
