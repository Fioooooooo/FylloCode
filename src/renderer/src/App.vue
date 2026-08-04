<script setup lang="ts">
import { computed, onUnmounted } from "vue";
import type { ToasterProps, TooltipProps } from "@nuxt/ui";
import ActivityBar from "@renderer/components/layout/ActivityBar.vue";
import AppHeader from "@renderer/components/layout/AppHeader.vue";
import AppLayout from "@renderer/layouts/AppLayout.vue";
import StartupLoading from "@renderer/components/shared/StartupLoading.vue";
import { useSessionStore } from "@renderer/stores";
import { bootstrapPhaseState } from "@renderer/bootstrap";

const toasterOptions: ToasterProps = {
  position: "top-center",
  progress: false,
  duration: 2000,
};

const tooltipOptions: TooltipProps = {
  delayDuration: 200,
};

const sessionStore = useSessionStore();
const unsubscribeProbeUpdates = sessionStore.subscribeProbeUpdates();
const isCriticalBootstrapPending = computed(() => bootstrapPhaseState.critical !== "settled");

onUnmounted(() => {
  unsubscribeProbeUpdates();
});
</script>

<template>
  <StartupLoading v-if="isCriticalBootstrapPending" />
  <Suspense v-else>
    <UApp :toaster="toasterOptions" :tooltip="tooltipOptions">
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
