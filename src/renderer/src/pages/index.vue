<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import WelcomeView from "@renderer/components/welcome/WelcomeView.vue";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import { useProjectStore } from "@renderer/stores/project";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { activityBarItems } from "@renderer/config/activity-bar";

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const { goToDefault } = useDefaultAppRoute();
const projectScopedRoutes = ["/proposal", "/specs"];

const protectedRoutes = computed(() =>
  Array.from(
    new Set([
      ...activityBarItems.filter((i) => i.requiresProject).map((i) => i.path),
      ...projectScopedRoutes,
    ])
  )
);

watchEffect(() => {
  const isProtectedRoute = protectedRoutes.value.some((path) => route.path.startsWith(path));

  if (isProtectedRoute && !projectStore.hasCurrentProject) {
    void router.replace("/");
  }
});

watchEffect(() => {
  if (projectStore.hasCurrentProject && route.path === "/") {
    void goToDefault();
  }
});

async function openLauncher(): Promise<void> {
  await projectStore.openLauncherWindow();
}
</script>

<template>
  <div
    v-if="projectStore.projectContextError"
    class="flex-1 flex items-center justify-center bg-default"
  >
    <AppEmptyState
      icon="i-lucide-folder-x"
      title="无法打开项目"
      :description="projectStore.projectContextError.message"
      action-label="打开启动窗口"
      action-icon="i-lucide-rocket"
      @action="openLauncher"
    />
  </div>
  <WelcomeView v-else-if="!projectStore.hasCurrentProject" />
  <RouterView v-else />
</template>
