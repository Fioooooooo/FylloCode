<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useWorkspaceStore } from "@renderer/stores";

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

async function restore(workspaceId: string): Promise<void> {
  errorMessage.value = "";
  try {
    await workspaceStore.restoreDeletedWorkspace(workspaceId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function permanentlyDelete(workspaceId: string): Promise<void> {
  const accepted = await confirm({
    title: "永久删除 Workspace？",
    description:
      "此操作不可恢复。它会删除当前 Workspace 数据和窗口状态；若存在可唯一归属的迁移副本，也会一并删除。共享 Folder、repository 和无法安全归属的历史 orphan 不会被删除。",
    confirmLabel: "永久删除",
    confirmColor: "error",
  });
  if (!accepted) return;
  errorMessage.value = "";
  try {
    await workspaceStore.permanentlyDeleteWorkspace(workspaceId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="已删除的 Workspace"
    description="恢复可恢复项，或继续处理未完成的永久清理。"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="workspaceStore.deletedWorkspaces.length === 0" class="py-8 text-center text-muted">
        没有已删除的 Workspace
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
              <div class="truncate text-xs text-muted">{{ workspace.primaryFolderPath }}</div>
              <div class="mt-1 text-xs text-warning">{{ workspace.cleanupState }}</div>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="workspace.cleanupState === 'restorable'"
                size="sm"
                variant="soft"
                @click="restore(workspace.workspaceId)"
                >恢复</UButton
              >
              <UButton
                size="sm"
                color="error"
                variant="soft"
                @click="permanentlyDelete(workspace.workspaceId)"
              >
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
