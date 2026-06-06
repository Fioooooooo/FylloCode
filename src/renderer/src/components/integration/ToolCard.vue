<script setup lang="ts">
import { ref, computed } from "vue";
import type { IntegrationTool } from "@shared/types/integration";
import { useIntegrationStore } from "@renderer/stores/integration";
import ToolCardExpand from "./ToolCardExpand.vue";

const props = defineProps<{
  tool: IntegrationTool;
}>();

const integrationStore = useIntegrationStore();

const isExpanded = ref(false);
const isConnected = computed(() => integrationStore.isToolConnected(props.tool.id));

function onToggleExpand(): void {
  if (props.tool.comingSoon) return;
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <div
    class="border rounded-lg bg-card transition-all duration-200"
    :class="[
      tool.comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/40',
      isExpanded && !tool.comingSoon
        ? 'border-primary/60 ring-1 ring-primary/20'
        : 'border-default',
    ]"
    @click="onToggleExpand"
  >
    <!-- Card Front -->
    <div class="p-4">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="tool.comingSoon ? 'bg-muted/50' : 'bg-primary/10'"
          >
            <UIcon :name="tool.logoIcon" class="w-5 h-5" :class="tool.logoColor" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-highlighted truncate">{{ tool.name }}</h3>
            <p class="text-xs text-muted truncate">{{ tool.description }}</p>
          </div>
        </div>

        <!-- Connection Status -->
        <div class="flex items-center gap-1.5 shrink-0 ml-2">
          <template v-if="tool.comingSoon">
            <UBadge size="xs" variant="soft" color="neutral">即将推出</UBadge>
          </template>
          <template v-else-if="isConnected">
            <UBadge size="xs" variant="soft" color="success" class="flex items-center gap-1">
              <UIcon name="i-lucide-check" class="w-3 h-3" />
              已连接
            </UBadge>
          </template>
          <template v-else>
            <UBadge size="xs" variant="soft" color="neutral">未连接</UBadge>
          </template>
        </div>
      </div>
    </div>

    <!-- Expanded Config Panel -->
    <div
      v-if="isExpanded && !tool.comingSoon"
      class="border-t border-default bg-muted/20"
      @click.stop
    >
      <ToolCardExpand :tool="tool" />
    </div>
  </div>
</template>
