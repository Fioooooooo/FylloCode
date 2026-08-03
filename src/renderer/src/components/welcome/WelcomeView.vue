<script setup lang="ts">
import { ref } from "vue";
import { useWorkspaceStore } from "@renderer/stores";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import WorkspaceList from "@renderer/components/welcome/WorkspaceList.vue";
import WorkspaceEditorModal from "@renderer/components/welcome/WorkspaceEditorModal.vue";
import DeletedWorkspaceManager from "@renderer/components/welcome/DeletedWorkspaceManager.vue";
import Logo from "@renderer/components/shared/Logo.vue";
import { workspaceKindLabel } from "@renderer/utils/workspace-presentation";
import type { WorkspaceLauncherItem } from "@shared/types/workspace";

const { goToDefault } = useDefaultAppRoute();
const workspaceStore = useWorkspaceStore();
const confirm = useConfirmDialog();
const editorOpen = ref(false);
const deletedOpen = ref(false);
const editorWorkspace = ref<WorkspaceLauncherItem | null>(null);
const editorMode = ref<"create" | "edit">("create");

async function handleOpenFolder(): Promise<void> {
  const project = await workspaceStore.openFolderWindow();
  if (project) {
    await goToDefault();
  }
}

async function handleOpenRecent(workspace: WorkspaceLauncherItem): Promise<void> {
  const openedWorkspace = await workspaceStore.openRecentWorkspace(workspace);
  if (openedWorkspace) {
    await goToDefault();
  }
}

async function handleRemove(workspace: WorkspaceLauncherItem): Promise<void> {
  const subject = workspaceKindLabel(workspace.workspaceKind);
  const accepted = await confirm({
    title: `删除 ${subject}？`,
    description: `${subject} 将从最近打开中移除，但 FylloCode 数据会保留，可以从“回收站”恢复。`,
    confirmLabel: `删除 ${subject}`,
    confirmColor: "error",
  });
  if (!accepted) return;
  await workspaceStore.removeRecentWorkspace(workspace.workspaceId);
}

function openCreate(seed: WorkspaceLauncherItem | null = null): void {
  editorWorkspace.value = seed;
  editorMode.value = "create";
  editorOpen.value = true;
}

function openEdit(workspace: WorkspaceLauncherItem): void {
  editorWorkspace.value = workspace;
  editorMode.value = "edit";
  editorOpen.value = true;
}

function openDeleted(): void {
  deletedOpen.value = true;
}
</script>

<template>
  <div class="flex-1 flex items-center justify-center bg-default overflow-y-auto">
    <div class="flex flex-col items-center max-w-xl w-full px-6 py-8">
      <!-- Brand Identity -->
      <div class="flex flex-col items-center mb-10">
        <div class="flex items-center gap-3">
          <Logo alt="FylloCode" class="size-10" data-test="welcome-brand-icon" />
          <h1 class="text-3xl font-bold text-highlighted">FylloCode</h1>
        </div>
        <p class="text-muted mt-2"></p>
      </div>

      <!-- Action Buttons -->
      <div class="mb-10 flex w-full justify-center gap-3">
        <UButton
          icon="i-lucide-folder-open"
          color="primary"
          size="lg"
          class="flex-1 justify-center"
          @click="handleOpenFolder"
        >
          打开 Project
        </UButton>
        <UButton
          icon="i-lucide-layout-grid"
          color="neutral"
          variant="soft"
          size="lg"
          class="flex-1 justify-center"
          @click="openCreate()"
        >
          创建 Workspace
        </UButton>
      </div>

      <!-- Recent items -->
      <WorkspaceList
        @open="handleOpenRecent"
        @edit="openEdit"
        @create-from-folder="openCreate"
        @remove="handleRemove"
      />
      <UButton class="mt-5" variant="link" color="neutral" @click="openDeleted"> 回收站 </UButton>
    </div>
    <WorkspaceEditorModal
      v-model:open="editorOpen"
      :mode="editorMode"
      :workspace="editorWorkspace"
      @saved="workspaceStore.loadWorkspaces()"
    />
    <DeletedWorkspaceManager v-model:open="deletedOpen" />
  </div>
</template>
