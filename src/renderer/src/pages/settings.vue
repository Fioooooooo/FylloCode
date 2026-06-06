<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SettingsAgents from "@renderer/components/settings/SettingsAgents.vue";
import SettingsAbout from "@renderer/components/settings/SettingsAbout.vue";
import SettingsIntegrationProviders from "@renderer/components/settings/SettingsIntegrationProviders.vue";
import SettingsPreferences from "@renderer/components/settings/SettingsPreferences.vue";

const route = useRoute();
const router = useRouter();

type SettingsTab = "agents" | "integration-providers" | "preferences" | "about";

function resolveActiveTab(value: unknown): SettingsTab {
  if (value === "integration-providers") return "integration-providers";
  if (value === "preferences") return "preferences";
  if (value === "about") return "about";
  return "agents";
}

const activeTab = ref<SettingsTab>(resolveActiveTab(route.query["tab"]));

watch(
  () => route.query["tab"],
  (value) => {
    activeTab.value = resolveActiveTab(value);
  }
);

const activeComponent = computed(() => {
  if (activeTab.value === "integration-providers") return SettingsIntegrationProviders;
  if (activeTab.value === "preferences") return SettingsPreferences;
  if (activeTab.value === "about") return SettingsAbout;
  return SettingsAgents;
});

function selectTab(tab: SettingsTab): void {
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
  <div class="flex flex-1 overflow-hidden bg-default flex-row">
    <nav class="flex shrink-0 gap-1 border-default px-2 py-4 w-65 flex-col border-r overflow-auto">
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
      <UButton
        variant="ghost"
        :color="activeTab === 'about' ? 'primary' : 'neutral'"
        class="justify-start"
        @click="selectTab('about')"
      >
        <UIcon name="i-lucide-info" class="mr-2 h-4 w-4" />
        About
      </UButton>
    </nav>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-2xl px-6 py-8">
        <component :is="activeComponent" />
      </div>
    </div>
  </div>
</template>
