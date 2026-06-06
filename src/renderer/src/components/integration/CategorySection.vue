<script setup lang="ts">
import type { IntegrationCategory, IntegrationTool } from "@shared/types/integration";
import ToolCard from "./ToolCard.vue";

defineProps<{
  category: IntegrationCategory;
  tools: IntegrationTool[];
}>();
</script>

<template>
  <section v-if="tools.length > 0" class="space-y-4">
    <div class="space-y-1">
      <h2 class="text-lg font-semibold text-highlighted">{{ category.name }}</h2>
      <p class="text-sm text-muted">{{ category.description }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <ToolCard v-for="tool in tools" :key="tool.id" :tool="tool" />
    </div>
  </section>
</template>
