<script setup lang="ts">
import AgentKindBadge from "@renderer/components/acp/AgentKindBadge.vue";
import CustomAgentIcon from "@renderer/components/acp/CustomAgentIcon.vue";
import type { AcpAgentEntry } from "@shared/types/acp-agent";

withDefaults(
  defineProps<{
    agent: AcpAgentEntry;
    icon?: string;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);
</script>

<template>
  <div
    class="flex gap-3 rounded-lg border bg-default p-4 group relative transition-colors border-default hover:bg-elevated/40"
    :class="[compact ? 'items-center' : 'items-start']"
  >
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white"
    >
      <img v-if="icon" :src="icon" :alt="agent.name" class="h-full w-full object-cover" />
      <CustomAgentIcon v-else class="h-full w-full" />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-3" :class="[compact ? '' : 'items-start']">
        <div class="min-w-0 flex-1" :class="[compact ? 'flex items-center gap-1.5' : '']">
          <div class="flex items-center gap-1.5">
            <span class="min-w-0 truncate text-sm font-semibold text-highlighted">
              {{ agent.name }}
            </span>
            <AgentKindBadge :kind="agent.__fyllo?.kind" />
          </div>

          <div v-if="!compact" class="mt-1 flex items-center gap-1.5 text-xs text-muted/60">
            <span v-if="agent.version" class="shrink-0">{{ agent.version }}</span>
            <slot name="meta" />
          </div>
        </div>

        <div v-if="$slots.actions" class="flex shrink-0 flex-col items-center gap-2">
          <slot name="actions" />
        </div>
      </div>

      <p v-if="!compact && agent.description" class="mt-1.5 text-xs text-muted line-clamp-2">
        {{ agent.description }}
      </p>
    </div>

    <div v-if="$slots.corner" class="absolute right-2 top-2">
      <slot name="corner" />
    </div>
  </div>
</template>
