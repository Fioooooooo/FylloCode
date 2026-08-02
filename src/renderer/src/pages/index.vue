<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import WelcomeView from "@renderer/components/welcome/WelcomeView.vue";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import { useWorkspaceStore } from "@renderer/stores";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { activityBarItems } from "@renderer/config/activity-bar";

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const { goToDefault } = useDefaultAppRoute();
const workspaceScopedRoutes = ["/proposal", "/specs"];

const protectedRoutes = computed(() =>
  Array.from(
    new Set([
      ...activityBarItems.filter((i) => i.requiresWorkspace).map((i) => i.path),
      ...workspaceScopedRoutes,
    ])
  )
);

watchEffect(() => {
  const isProtectedRoute = protectedRoutes.value.some((path) => route.path.startsWith(path));

  if (isProtectedRoute && !workspaceStore.hasCurrentWorkspace) {
    void router.replace("/");
  }
});

watchEffect(() => {
  if (workspaceStore.hasCurrentWorkspace && route.path === "/") {
    void goToDefault();
  }
});

async function openLauncher(): Promise<void> {
  await workspaceStore.openLauncherWindow();
}
</script>

<template>
  <div
    v-if="workspaceStore.workspaceContextError"
    class="flex-1 flex items-center justify-center bg-default"
  >
    <AppEmptyState
      icon="i-lucide-folder-x"
      title="无法打开工作区"
      :description="workspaceStore.workspaceContextError.message"
      action-label="打开启动窗口"
      action-icon="i-lucide-rocket"
      @action="openLauncher"
    />
  </div>
  <WelcomeView v-else-if="!workspaceStore.hasCurrentWorkspace" />
  <RouterView v-else />
</template>
