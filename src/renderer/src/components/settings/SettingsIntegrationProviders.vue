<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import IntegrationProviderCard from "./IntegrationProviderCard.vue";
import { useIntegrationProvidersStore } from "@renderer/stores/integration.providers";

const route = useRoute();
const integrationProvidersStore = useIntegrationProvidersStore();

const focusProviderId = computed(() => {
  const focus = route.query["focus"];
  return typeof focus === "string" ? focus : null;
});

async function scrollToFocusedProvider(): Promise<void> {
  if (!focusProviderId.value) return;
  await nextTick();
  document.getElementById(`provider-${focusProviderId.value}`)?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

onMounted(async () => {
  await integrationProvidersStore.loadProviders();
  await integrationProvidersStore.probeConnectedProviders();
  await scrollToFocusedProvider();
});

watch(focusProviderId, () => {
  void scrollToFocusedProvider();
});
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-bold text-highlighted">集成提供方</h1>
      <p class="text-sm text-muted">
        在这里统一管理全局 provider
        凭证。当前版本仅云效提供真实连接能力，其余条目保留为即将推出占位。
      </p>
    </div>

    <UInput
      :model-value="integrationProvidersStore.searchQuery"
      placeholder="搜索 provider..."
      @input="integrationProvidersStore.setSearchQuery(($event.target as HTMLInputElement).value)"
    />

    <div class="space-y-4">
      <IntegrationProviderCard
        v-for="provider in integrationProvidersStore.filteredProviders"
        :key="provider.id"
        :provider="provider"
        :autofocus="focusProviderId === provider.id"
      />
    </div>
  </div>
</template>
