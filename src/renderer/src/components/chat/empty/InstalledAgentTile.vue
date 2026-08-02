<script setup lang="ts">
import CustomAgentIcon from "@renderer/components/acp/CustomAgentIcon.vue";
import type { AdditionalDirectoriesCapability } from "@shared/types/acp-agent";

const props = defineProps<{
  agentId: string;
  name: string;
  icon?: string;
  selected?: boolean;
  workspaceCompatibility?: AdditionalDirectoriesCapability;
  checkingCompatibility?: boolean;
}>();

const emit = defineEmits<{
  select: [agentId: string];
}>();

function handleSelect(): void {
  if (props.workspaceCompatibility === "unsupported" || props.checkingCompatibility) {
    return;
  }
  emit("select", props.agentId);
}
</script>

<template>
  <UiSurface
    as="button"
    interactive
    padding="none"
    class="group relative flex aspect-square h-32 w-32 flex-col items-center justify-center gap-2"
    :class="[
      selected ? 'bg-primary/15 hover:bg-primary/15' : '',
      workspaceCompatibility === 'unsupported' ? 'cursor-not-allowed opacity-55' : '',
    ]"
    :disabled="workspaceCompatibility === 'unsupported' || checkingCompatibility"
    :aria-label="`${name}${workspaceCompatibility === 'unsupported' ? '，不支持多根工作区' : ''}`"
    @click="handleSelect"
  >
    <span
      v-if="selected"
      class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-inverted"
    >
      <UIcon name="i-lucide-check" class="h-3 w-3" />
    </span>
    <div
      class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted dark:bg-white/80"
    >
      <img v-if="icon" :src="icon" :alt="name" class="h-full w-full object-cover" />
      <CustomAgentIcon v-else class="h-full w-full" />
    </div>
    <span class="line-clamp-1 text-sm font-medium">{{ name }}</span>
    <span
      v-if="checkingCompatibility"
      class="px-2 text-center text-[11px] leading-tight text-muted"
    >
      正在检测…
    </span>
    <span
      v-else-if="workspaceCompatibility === 'unknown'"
      class="px-2 text-center text-[11px] leading-tight text-muted"
    >
      连接后检测
    </span>
    <span
      v-else-if="workspaceCompatibility === 'unsupported'"
      class="px-2 text-center text-[11px] leading-tight text-error"
    >
      不支持多根工作区
    </span>
  </UiSurface>
</template>
