<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import IntegrationProviderCard from "@renderer/components/settings/connections/IntegrationProviderCard.vue";
import { useIntegrationProvidersStore } from "@renderer/stores";

const route = useRoute();
const integrationProvidersStore = useIntegrationProvidersStore();

const searchQuery = computed({
  get: () => integrationProvidersStore.searchQuery,
  set: (value) => integrationProvidersStore.setSearchQuery(value),
});

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
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">服务连接</h1>
      <p class="text-sm text-muted">统一管理全局 provider 凭证。</p>
    </div>

    <UInput v-model="searchQuery" placeholder="搜索 provider…" size="sm" class="w-full">
      <template #leading>
        <UIcon name="i-lucide-search" class="h-4 w-4 text-muted" />
      </template>
    </UInput>

    <div class="space-y-4">
      <IntegrationProviderCard
        v-for="provider in integrationProvidersStore.filteredProviders"
        :key="provider.id"
        :provider="provider"
        :autofocus="focusProviderId === provider.id"
      />
    </div>

    <AppEmptyState
      v-if="integrationProvidersStore.filteredProviders.length === 0"
      icon="i-lucide-search-x"
      title="没有匹配的 Provider"
      description="尝试调整搜索关键词。"
      compact
    />
  </div>
</template>
