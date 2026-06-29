<script setup lang="ts">
import { computed } from "vue";
import { appApi } from "@renderer/api/app";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { useProjectStore } from "@renderer/stores/project";
import { useColorMode } from "@vueuse/core";
import type { RecentProject } from "@shared/types/project";
import ProjectHealthPopover from "./ProjectHealthPopover.vue";

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

async function openDevTools(): Promise<void> {
  const result = await appApi.openDevTools();
  if (!result.ok) {
    throw new Error(result.error.message);
  }
}
</script>

<template>
  <header
    class="h-8.75 flex items-center bg-muted/30 border-b border-default/50 shrink-0"
    style="-webkit-app-region: drag"
  >
    <!-- Left: Empty placeholder for macOS traffic lights -->
    <div class="w-[20%] h-full" />

    <!-- Center: Project Switcher -->
    <div class="w-[60%] h-full flex items-center justify-center gap-2">
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
          class="flex items-center gap-2 px-3 py-0.5 rounded-full bg-elevated cursor-pointer hover:bg-accented transition-colors"
          style="-webkit-app-region: no-drag"
        >
          <span class="truncate max-w-48 text-sm font-normal text-highlighted">
            {{ projectStore.currentProject?.name ?? "未选择项目" }}
          </span>
          <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" />
        </div>
      </UDropdownMenu>

      <ProjectHealthPopover />
    </div>

    <!-- Right: Controls -->
    <div class="w-[20%] h-full flex items-center justify-end pr-4">
      <div class="flex items-center justify-end gap-2" style="-webkit-app-region: no-drag">
        <!-- Debug Tools -->
        <UTooltip
          text="打开开发者工具"
          :disable-hoverable-content="true"
          :ignore-non-keyboard-focus="true"
        >
          <UButton
            variant="ghost"
            color="neutral"
            class="size-6 flex items-center justify-center text-muted p-0"
            @click="openDevTools"
          >
            <UIcon name="i-lucide-bug" class="size-4" />
          </UButton>
        </UTooltip>
        <!-- System Bell -->
        <UTooltip text="通知" :disable-hoverable-content="true" :ignore-non-keyboard-focus="true">
          <UButton
            variant="ghost"
            color="neutral"
            class="size-6 flex items-center justify-center text-muted p-0"
          >
            <UIcon name="i-lucide-bell" class="size-4" />
          </UButton>
        </UTooltip>
        <!-- Theme Toggle -->
        <UTooltip
          text="切换主题"
          :disable-hoverable-content="true"
          :ignore-non-keyboard-focus="true"
        >
          <UButton
            variant="ghost"
            color="neutral"
            class="size-6 flex items-center justify-center text-muted p-0"
            @click="toggleTheme"
          >
            <UIcon :name="colorMode === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" />
          </UButton>
        </UTooltip>
      </div>
    </div>
  </header>
</template>
