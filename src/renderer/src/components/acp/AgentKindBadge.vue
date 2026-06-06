<script setup lang="ts">
import { computed } from "vue";
import type { AcpAgentKind } from "@shared/types/acp-agent";

const props = defineProps<{
  kind?: AcpAgentKind;
}>();

const badge = computed(() => {
  if (props.kind === "adapter") {
    return {
      icon: "i-lucide-layers",
      text: "适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置",
    };
  }

  if (props.kind === "bridge") {
    return {
      icon: "i-lucide-cable",
      text: "桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent",
    };
  }

  return null;
});
</script>

<template>
  <UTooltip v-if="badge" :text="badge.text" :delay-duration="200">
    <UIcon :name="badge.icon" class="h-3.5 w-3.5 shrink-0 text-muted" />
  </UTooltip>
</template>
