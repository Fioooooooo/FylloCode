<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore, useWorkspaceStore } from "@renderer/stores";
import { workspaceKindLabel } from "@renderer/utils/workspace-presentation";

const sessionStore = useSessionStore();
const workspaceStore = useWorkspaceStore();
const { activeSession, activeSessionScopeDiff } = storeToRefs(sessionStore);

const snapshot = computed(() => activeSession.value?.workspaceSnapshot ?? null);
const currentSubjectLabel = computed(() => {
  const workspace = workspaceStore.currentWorkspace;
  return workspace ? workspaceKindLabel(workspace.kind) : "Project 或 Workspace";
});
const statusLabel = computed(() => {
  if (activeSessionScopeDiff.value?.isStale) return "Project 授权范围已失效";
  if (activeSessionScopeDiff.value?.hasChanges) return `与当前 ${currentSubjectLabel.value} 不同`;
  return "Project 授权范围已固定";
});

function snapshotFolderName(folderId: string): string {
  return (
    snapshot.value?.folders.find((folder) => folder.folderId === folderId)?.folderName ?? folderId
  );
}
</script>

<template>
  <div v-if="snapshot" class="shrink-0 px-2 pt-2" data-test="session-scope-header">
    <details class="group rounded-lg border border-default/50 bg-elevated/50">
      <summary
        class="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-xs text-muted outline-none transition-colors duration-150 hover:bg-accented focus-visible:ring-2 focus-visible:ring-primary/30"
        data-test="session-scope-summary"
      >
        <span class="font-medium text-highlighted">Agent Project 授权范围</span>
        <span>{{ snapshot.folders.length }} 个 Project</span>
        <span
          class="rounded-md px-1.5 py-0.5"
          :class="
            activeSessionScopeDiff?.isStale ? 'bg-error/15 text-error' : 'bg-muted text-muted'
          "
          data-test="session-scope-status"
        >
          {{ statusLabel }}
        </span>
        <span class="ml-auto text-muted group-open:hidden" aria-hidden="true">展开</span>
        <span class="ml-auto hidden text-muted group-open:inline" aria-hidden="true">收起</span>
      </summary>

      <div class="space-y-3 border-t border-default/50 px-3 py-3 text-xs" aria-live="polite">
        <ul class="grid min-w-0 gap-2 sm:grid-cols-2">
          <li
            v-for="folder in snapshot.folders"
            :key="folder.folderId"
            class="min-w-0 rounded-md bg-default px-2.5 py-2"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate font-medium text-highlighted">{{ folder.folderName }}</span>
              <span
                v-if="folder.folderId === snapshot.primaryFolderId"
                class="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-primary"
              >
                主 Project
              </span>
            </div>
            <code class="mt-1 block truncate text-[11px] text-muted" :title="folder.folderPath">
              {{ folder.folderPath }}
            </code>
          </li>
        </ul>

        <div
          v-if="activeSessionScopeDiff?.hasChanges"
          class="space-y-2 rounded-md border border-default/50 bg-default px-2.5 py-2 text-muted"
          data-test="session-scope-diff"
        >
          <p class="font-medium text-highlighted">当前 {{ currentSubjectLabel }} 已发生变化</p>
          <ul class="list-disc space-y-1 pl-4">
            <li v-if="activeSessionScopeDiff.currentOnly.length">
              当前新增 Project：{{
                activeSessionScopeDiff.currentOnly.map((folder) => folder.folderName).join("、")
              }}
            </li>
            <li v-if="activeSessionScopeDiff.snapshotOnly.length">
              已从当前 {{ currentSubjectLabel }} 移除：{{
                activeSessionScopeDiff.snapshotOnly.map((folder) => folder.folderName).join("、")
              }}
            </li>
            <li v-if="activeSessionScopeDiff.primaryChanged">主 Project 已变更</li>
            <li
              v-for="change in activeSessionScopeDiff.nameChanges"
              :key="`name-${change.folderId}`"
            >
              {{ change.snapshotName }} 已重命名为 {{ change.currentName }}
            </li>
            <li
              v-for="change in activeSessionScopeDiff.pathChanges"
              :key="`path-${change.folderId}`"
            >
              {{ snapshotFolderName(change.folderId) }} 的项目目录已变更
            </li>
            <li v-if="activeSessionScopeDiff.unavailableFolderIds.length">
              项目目录不可用：{{
                activeSessionScopeDiff.unavailableFolderIds.map(snapshotFolderName).join("、")
              }}
            </li>
          </ul>
          <p>
            此 Session 仍使用创建时的 Project 授权范围；新建 Session 才能获得当前 Project 授权。
          </p>
        </div>
      </div>
    </details>
  </div>
</template>
