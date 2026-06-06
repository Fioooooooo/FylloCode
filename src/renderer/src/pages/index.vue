<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import WelcomeView from "@renderer/components/welcome/WelcomeView.vue";
import { useProjectStore } from "@renderer/stores/project";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { activityBarItems } from "@renderer/config/activity-bar";

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const { goToDefault } = useDefaultAppRoute();

const protectedRoutes = computed(() =>
  activityBarItems.filter((i) => i.requiresProject).map((i) => i.path)
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
</script>

<template>
  <WelcomeView v-if="!projectStore.hasCurrentProject" />
  <RouterView v-else />
</template>
