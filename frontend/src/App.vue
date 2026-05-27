<script setup lang="ts">
import { onUnmounted } from "vue";
import type { ToasterProps } from "@nuxt/ui";
import ActivityBar from "@renderer/components/layout/ActivityBar.vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";
import AppLayout from "@renderer/layouts/AppLayout.vue";
import { useSessionStore } from "@renderer/stores/session";

const toasterOptions: ToasterProps = {
  position: "top-center",
  progress: false,
  duration: 2000,
};

const sessionStore = useSessionStore();
const unsubscribeProbeUpdates = sessionStore.subscribeProbeUpdates();

onUnmounted(() => {
  unsubscribeProbeUpdates();
});
</script>

<template>
  <Suspense>
    <UApp :toaster="toasterOptions">
      <AppLayout>
        <template #header>
          <AppHeader />
        </template>

        <template #side>
          <ActivityBar />
        </template>

        <RouterView />
      </AppLayout>
    </UApp>
  </Suspense>
</template>
