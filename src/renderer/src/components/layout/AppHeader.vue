<script setup lang="ts">
import { appApi } from "@renderer/api/platform/app";
import { useColorMode } from "@vueuse/core";
import ProjectHealthPopover from "./ProjectHealthPopover.vue";
import WorkspaceSwitcher from "./WorkspaceSwitcher.vue";

const colorMode = useColorMode();

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

    <!-- Center: Workspace Switcher -->
    <div class="w-[60%] h-full flex items-center justify-center gap-2">
      <WorkspaceSwitcher />
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
