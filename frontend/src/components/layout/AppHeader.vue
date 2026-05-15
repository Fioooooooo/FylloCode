<script setup lang="ts">
import { computed } from "vue";
import { useProjectStore } from "@renderer/stores/project";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { useColorMode } from "@vueuse/core";
import type { RecentProject } from "@shared/types/project";

const { goToDefault } = useDefaultAppRoute();
const projectStore = useProjectStore();
const colorMode = useColorMode();

const dropdownItems = computed(() => {
  const projectItems = projectStore.recentProjects.map((project: RecentProject) => ({
    label: project.name,
    onSelect: async () => {
      await projectStore.openRecentProject(project);
    },
  }));

  return [
    ...projectItems,
    { type: "separator" as const },
    {
      label: "打开项目",
      icon: "i-lucide-folder-open",
      onSelect: async () => {
        const project = await projectStore.openFolder();
        if (project) {
          await goToDefault();
        }
      },
    },
  ];
});

function toggleTheme(): void {
  colorMode.value = colorMode.value === "dark" ? "light" : "dark";
}
</script>

<template>
  <header
    class="h-8.75 flex items-center border-b border-default bg-default shrink-0"
    style="-webkit-app-region: drag"
  >
    <!-- Left: Empty placeholder for macOS traffic lights -->
    <div class="w-[20%] h-full" />

    <!-- Center: Project Switcher -->
    <div class="w-[60%] h-full flex items-center justify-center">
      <UDropdownMenu
        :items="dropdownItems"
        :content="{
          align: 'center',
          side: 'bottom',
          sideOffset: 4,
        }"
        :ui="{
          content: 'w-full max-h-80 overflow-y-auto',
        }"
      >
        <div
          class="flex items-center gap-2 px-3 py-0.5 rounded-md border border-default cursor-pointer hover:bg-muted/50 transition-colors"
          style="-webkit-app-region: no-drag"
        >
          <span class="truncate max-w-50 text-sm font-normal text-muted">
            {{ projectStore.currentProject?.name ?? "未选择项目" }}
          </span>
          <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-muted" />
        </div>
      </UDropdownMenu>
    </div>

    <!-- Right: Controls -->
    <div class="w-[20%] h-full flex items-center justify-end pr-4">
      <div class="flex items-center justify-end gap-2" style="-webkit-app-region: no-drag">
        <!-- System Bell -->
        <UButton
          variant="ghost"
          color="neutral"
          class="w-5.5 h-5.5 flex items-center justify-center text-muted p-0"
        >
          <UIcon name="i-lucide-bell" class="w-4 h-4" />
        </UButton>
        <!-- Theme Toggle -->
        <UButton
          variant="ghost"
          color="neutral"
          class="w-5.5 h-5.5 flex items-center justify-center text-muted p-0"
          @click="toggleTheme"
        >
          <UIcon :name="colorMode === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-4 h-4" />
        </UButton>
      </div>
    </div>
  </header>
</template>
