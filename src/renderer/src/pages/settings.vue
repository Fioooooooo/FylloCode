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
  <div class="flex flex-1 overflow-hidden bg-elevated space-x-2">
    <nav class="flex w-65 shrink-0 flex-col gap-1 bg-default rounded-lg px-2 py-4 overflow-auto">
      <button
        v-for="tab in [
          { id: 'agents', label: 'Agents', icon: 'i-lucide-bot' },
          { id: 'integration-providers', label: '集成提供方', icon: 'i-lucide-plug-zap' },
          { id: 'preferences', label: '偏好设置', icon: 'i-lucide-sliders-horizontal' },
          { id: 'about', label: 'About', icon: 'i-lucide-info' },
        ]"
        :key="tab.id"
        type="button"
        class="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
        :class="
          activeTab === tab.id
            ? 'bg-primary/15 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-primary'
            : 'hover:bg-elevated'
        "
        @click="selectTab(tab.id as SettingsTab)"
      >
        <UIcon :name="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </button>
    </nav>

    <div class="flex-1 flex min-w-0">
      <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
        <div class="mx-auto max-w-2xl px-6 py-8 w-full">
          <component :is="activeComponent" />
        </div>
      </div>
    </div>
  </div>
</template>
