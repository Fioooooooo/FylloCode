<script setup lang="ts">
import { useProjectStore } from "@renderer/stores";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import ProjectList from "@renderer/components/welcome/ProjectList.vue";
import Logo from "@renderer/components/shared/Logo.vue";
import type { RecentProject } from "@shared/types/project";

const { goToDefault } = useDefaultAppRoute();
const projectStore = useProjectStore();

async function handleOpenFolder(): Promise<void> {
  const project = await projectStore.openFolderWindow();
  if (project) {
    await goToDefault();
  }
}

async function handleOpenRecent(project: RecentProject): Promise<void> {
  const openedProject = await projectStore.openRecentProject(project);
  if (openedProject) {
    await goToDefault();
  }
}

async function handleRemove(projectId: string): Promise<void> {
  await projectStore.removeRecentProject(projectId);
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
      <div class="w-full mb-10 flex justify-center">
        <UButton
          icon="i-lucide-folder-open"
          color="primary"
          size="lg"
          class="w-2/3 justify-center"
          @click="handleOpenFolder"
        >
          打开文件夹
        </UButton>
      </div>

      <!-- Recent Projects -->
      <ProjectList @open="handleOpenRecent" @remove="handleRemove" />
    </div>
  </div>
</template>
