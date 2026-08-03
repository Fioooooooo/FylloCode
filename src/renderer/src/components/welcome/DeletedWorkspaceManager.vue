<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useWorkspaceStore } from "@renderer/stores";
import {
  presentWorkspaceError,
  workspaceCleanupStateLabel,
  workspaceKindLabel,
} from "@renderer/utils/workspace-presentation";
import type { WorkspaceLauncherItem } from "@shared/types/workspace";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const workspaceStore = useWorkspaceStore();
const confirm = useConfirmDialog();
const errorMessage = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) void workspaceStore.loadDeletedWorkspaces();
  }
);

async function restore(workspace: WorkspaceLauncherItem): Promise<void> {
  errorMessage.value = "";
  try {
    await workspaceStore.restoreDeletedWorkspace(workspace.workspaceId);
  } catch (error) {
    errorMessage.value = presentWorkspaceError(error, workspace.workspaceKind);
  }
}

async function permanentlyDelete(workspace: WorkspaceLauncherItem): Promise<void> {
  const subject = workspaceKindLabel(workspace.workspaceKind);
  const accepted = await confirm({
    title: `永久删除 ${subject}？`,
    description: `此操作不可恢复。它会删除该 ${subject} 的 FylloCode 数据和窗口状态；若存在可唯一归属的迁移副本，也会一并删除。磁盘上的项目目录或 Git repository 不会被删除；无法安全归属的数据会继续保留。`,
    confirmLabel: `永久删除 ${subject}`,
    confirmColor: "error",
  });
  if (!accepted) return;
  errorMessage.value = "";
  try {
    await workspaceStore.permanentlyDeleteWorkspace(workspace.workspaceId);
  } catch (error) {
    errorMessage.value = presentWorkspaceError(error, workspace.workspaceKind);
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="回收站"
    description="恢复可恢复项，或继续处理未完成的永久清理。"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="workspaceStore.deletedWorkspaces.length === 0" class="py-8 text-center text-muted">
        回收站中没有可管理的内容
      </div>
      <div v-else class="max-h-96 space-y-2 overflow-y-auto">
        <div
          v-for="workspace in workspaceStore.deletedWorkspaces"
          :key="workspace.workspaceId"
          class="rounded-lg border border-default p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-medium text-highlighted">{{ workspace.workspaceName }}</div>
              <div class="mt-1 flex items-center gap-2">
                <UBadge size="xs" color="neutral" variant="subtle">
                  {{ workspaceKindLabel(workspace.workspaceKind) }}
                </UBadge>
                <span class="truncate text-xs text-muted">
                  项目目录：{{ workspace.primaryFolderPath }}
                </span>
              </div>
              <div v-if="workspace.cleanupState" class="mt-1 text-xs text-warning">
                {{ workspaceCleanupStateLabel(workspace.cleanupState) }}
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="workspace.cleanupState === 'restorable'"
                size="sm"
                variant="soft"
                @click="restore(workspace)"
                >恢复</UButton
              >
              <UButton size="sm" color="error" variant="soft" @click="permanentlyDelete(workspace)">
                {{ workspace.cleanupState === "restorable" ? "永久删除" : "重试清理" }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
      <p v-if="errorMessage" class="mt-3 rounded-lg bg-error/10 p-3 text-sm text-error">
        {{ errorMessage }}
      </p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">关闭</UButton>
    </template>
  </UModal>
</template>
