<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SettingsAgents from "@renderer/components/settings/SettingsAgents.vue";
import SettingsIntegrationProviders from "@renderer/components/settings/SettingsIntegrationProviders.vue";
import SettingsPreferences from "@renderer/components/settings/SettingsPreferences.vue";

const route = useRoute();
const router = useRouter();
const activeTab = ref<"agents" | "preferences" | "integration-providers">(
  route.query["tab"] === "integration-providers"
    ? "integration-providers"
    : route.query["tab"] === "preferences"
      ? "preferences"
      : "agents"
);

watch(
  () => route.query["tab"],
  (value) => {
    activeTab.value =
      value === "integration-providers"
        ? "integration-providers"
        : value === "preferences"
          ? "preferences"
          : "agents";
  }
);

const activeComponent = computed(() => {
  if (activeTab.value === "integration-providers") return SettingsIntegrationProviders;
  return activeTab.value === "agents" ? SettingsAgents : SettingsPreferences;
});

function selectTab(tab: typeof activeTab.value): void {
  activeTab.value = tab;
  void router.replace({
    path: "/settings",
    query: {
      ...route.query,
      tab: tab === "agents" ? undefined : tab,
    },
  });
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-default">
    <nav class="w-65 shrink-0 border-r border-default px-2 py-4 flex flex-col gap-1">
      <UButton
        variant="ghost"
        :color="activeTab === 'agents' ? 'primary' : 'neutral'"
        class="justify-start"
        @click="selectTab('agents')"
      >
        <UIcon name="i-lucide-bot" class="mr-2 h-4 w-4" />
        Agents
      </UButton>
      <UButton
        variant="ghost"
        :color="activeTab === 'integration-providers' ? 'primary' : 'neutral'"
        class="justify-start"
        @click="selectTab('integration-providers')"
      >
        <UIcon name="i-lucide-plug-zap" class="mr-2 h-4 w-4" />
        集成提供方
      </UButton>
      <UButton
        variant="ghost"
        :color="activeTab === 'preferences' ? 'primary' : 'neutral'"
        class="justify-start"
        @click="selectTab('preferences')"
      >
        <UIcon name="i-lucide-sliders-horizontal" class="mr-2 h-4 w-4" />
        偏好设置
      </UButton>
    </nav>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-240 px-6 py-8">
        <component :is="activeComponent" />
      </div>
    </div>
  </div>
</template>
