<script setup lang="ts">
import { useWorkspaceStore } from "@renderer/stores";
import { timeAgo } from "@renderer/utils/time";
import {
  presentWorkspaceError,
  workspaceKindLabel,
  workspacePresentationTerms,
} from "@renderer/utils/workspace-presentation";
import type { WorkspaceLauncherItem } from "@shared/types/workspace";

const workspaceStore = useWorkspaceStore();
const emit = defineEmits<{
  open: [workspace: WorkspaceLauncherItem];
  edit: [workspace: WorkspaceLauncherItem];
  createFromFolder: [workspace: WorkspaceLauncherItem];
  remove: [workspace: WorkspaceLauncherItem];
}>();
</script>

<template>
  <div class="w-full">
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">最近打开</h2>
    <div v-if="workspaceStore.isLoading" class="py-8 text-center text-muted">正在加载…</div>
    <div v-else-if="workspaceStore.loadError" class="rounded-lg bg-error/10 p-4 text-sm text-error">
      {{ presentWorkspaceError(workspaceStore.loadError) }}
    </div>
    <div
      v-else-if="workspaceStore.recentWorkspaces.length === 0"
      class="py-8 text-center text-muted"
    >
      暂无最近打开的 Project 或 Workspace
    </div>
    <div v-else class="max-h-80 space-y-1 overflow-y-auto">
      <div
        v-for="workspace in workspaceStore.recentWorkspaces"
        :key="workspace.workspaceId"
        class="group rounded-lg px-4 py-3 hover:bg-elevated"
        :data-test="`workspace-item-${workspace.workspaceId}`"
      >
        <div class="flex items-start justify-between gap-4">
          <button
            type="button"
            class="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
            @click="emit('open', workspace)"
          >
            <div class="flex items-center gap-2">
              <span class="truncate font-semibold text-highlighted">{{
                workspace.workspaceName
              }}</span>
              <UBadge size="xs" color="neutral" variant="subtle">
                {{ workspaceKindLabel(workspace.workspaceKind) }}
              </UBadge>
              <UBadge
                v-if="workspace.missingFolderCount"
                size="xs"
                color="warning"
                variant="subtle"
              >
                {{ workspace.missingFolderCount }} 个缺失
              </UBadge>
            </div>
            <div class="truncate text-xs text-muted">{{ workspace.primaryFolderPath }}</div>
            <div v-if="workspace.workspaceKind === 'collection'" class="mt-1 text-xs text-dimmed">
              共 {{ workspace.folderCount }} 个 {{ workspacePresentationTerms.member }}
            </div>
          </button>
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-xs text-muted">{{ timeAgo(workspace.lastOpenedAt) }}</span>
            <UButton
              icon="i-lucide-settings-2"
              variant="ghost"
              size="xs"
              color="neutral"
              :aria-label="`编辑 ${workspaceKindLabel(workspace.workspaceKind)}`"
              @click="emit('edit', workspace)"
            />
            <UButton
              v-if="workspace.workspaceKind === 'folder'"
              icon="i-lucide-copy-plus"
              variant="ghost"
              size="xs"
              color="neutral"
              aria-label="基于此 Project 创建 Workspace"
              @click="emit('createFromFolder', workspace)"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              color="error"
              :aria-label="`删除 ${workspaceKindLabel(workspace.workspaceKind)}`"
              @click="emit('remove', workspace)"
            />
          </div>
        </div>
        <details
          v-if="workspace.folderCount > 1 || workspace.missingFolderCount"
          class="mt-2 text-xs text-muted"
        >
          <summary class="cursor-pointer select-none">查看全部 Project</summary>
          <ul class="mt-1 space-y-1 pl-4">
            <li v-for="folder in workspace.folders" :key="folder.folderId" class="break-all">
              <span v-if="folder.isPrimary" class="text-primary">主 Project · </span
              >{{ folder.folderPath }}
              <span v-if="folder.pathMissing" class="text-warning"> · 项目目录缺失</span>
            </li>
          </ul>
        </details>
      </div>
    </div>
  </div>
</template>
