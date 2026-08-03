<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore, useWorkspaceStore } from "@renderer/stores";
import { workspaceKindLabel } from "@renderer/utils/workspace-presentation";

const sessionStore = useSessionStore();
const workspaceStore = useWorkspaceStore();
const { activeSession, activeSessionScopeDiff } = storeToRefs(sessionStore);

const open = ref(false);
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
const triggerLabel = computed(() => {
  if (activeSessionScopeDiff.value?.isStale) {
    return "Agent 授权范围：已失效";
  }
  if (activeSessionScopeDiff.value?.hasChanges) {
    return `Agent 授权范围：与当前 ${currentSubjectLabel.value} 不同`;
  }
  return "Agent 授权范围";
});
const statusIcon = computed(() =>
  activeSessionScopeDiff.value?.isStale ? "i-lucide-circle-alert" : "i-lucide-triangle-alert"
);
const statusColorClass = computed(() =>
  activeSessionScopeDiff.value?.isStale ? "text-error" : "text-warning"
);
const statusSurfaceClass = computed(() =>
  activeSessionScopeDiff.value?.isStale
    ? "border-error/30 bg-error/5"
    : "border-warning/30 bg-warning/5"
);

function snapshotFolderName(folderId: string): string {
  return (
    snapshot.value?.folders.find((folder) => folder.folderId === folderId)?.folderName ?? folderId
  );
}

function closePopover(): void {
  open.value = false;
}
</script>

<template>
  <UPopover
    v-if="snapshot"
    v-model:open="open"
    :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
    :ui="{ content: 'w-96 max-w-[calc(100vw-2rem)] p-0' }"
    data-test="session-scope-popover"
  >
    <template #default>
      <UTooltip
        :text="triggerLabel"
        :disable-hoverable-content="true"
        :ignore-non-keyboard-focus="true"
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          class="relative"
          :title="triggerLabel"
          :aria-label="triggerLabel"
          :aria-expanded="String(open)"
          data-test="session-scope-trigger"
        >
          <UIcon name="i-lucide-folder-key" class="size-4" aria-hidden="true" />
          <span
            v-if="activeSessionScopeDiff?.hasChanges || activeSessionScopeDiff?.isStale"
            class="pointer-events-none absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-default"
            data-test="session-scope-trigger-status"
            aria-hidden="true"
          >
            <UIcon :name="statusIcon" :class="['size-3', statusColorClass]" />
          </span>
        </UButton>
      </UTooltip>
    </template>

    <template #content>
      <div class="flex max-h-[calc(100vh-5rem)] min-w-0 flex-col" data-test="session-scope-content">
        <div class="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted">Agent 可访问的 Project</p>
            <p class="mt-0.5 text-xs text-muted">
              共 {{ snapshot.folders.length }} 个 Project · 会话创建时固定
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            title="关闭授权范围"
            aria-label="关闭授权范围"
            @click="closePopover"
          />
        </div>

        <div
          v-if="activeSessionScopeDiff?.hasChanges || activeSessionScopeDiff?.isStale"
          class="mx-3 mb-2 flex gap-2 rounded-lg border px-2.5 py-2 text-xs text-muted"
          :class="statusSurfaceClass"
          data-test="session-scope-diff"
          aria-live="polite"
        >
          <UIcon
            :name="statusIcon"
            :class="['mt-0.5 size-4 shrink-0', statusColorClass]"
            aria-hidden="true"
          />
          <div class="min-w-0 space-y-2">
            <p class="font-medium" :class="statusColorClass" data-test="session-scope-status">
              {{ statusLabel }}
            </p>
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

        <ul
          class="min-w-0 max-h-72 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pb-1"
          data-test="session-scope-project-list"
        >
          <li
            v-for="folder in snapshot.folders"
            :key="folder.folderId"
            class="grid min-w-0 grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 hover:bg-elevated"
            data-test="session-scope-project"
          >
            <span class="grid size-3 place-items-center" aria-hidden="true">
              <span
                v-if="folder.folderId === snapshot.primaryFolderId"
                class="size-1.5 rounded-full bg-primary ring-2 ring-primary/15"
                data-test="session-scope-primary-dot"
              />
            </span>
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-default" :title="folder.folderName">
                {{ folder.folderName }}
              </p>
              <code class="mt-0.5 block truncate text-[11px] text-muted" :title="folder.folderPath">
                {{ folder.folderPath }}
              </code>
            </div>
            <span
              v-if="folder.folderId === snapshot.primaryFolderId"
              class="shrink-0 text-[11px] font-medium text-primary"
              data-test="session-scope-primary-label"
            >
              主 Project
            </span>
          </li>
        </ul>

        <p class="border-t border-default/50 px-4 py-2.5 text-[11px] leading-relaxed text-muted">
          此授权范围在 Session 创建时固定；Workspace 成员变更不会自动更新当前 Session。
        </p>
      </div>
    </template>
  </UPopover>
</template>
