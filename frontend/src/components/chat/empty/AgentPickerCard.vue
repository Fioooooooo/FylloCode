<script setup lang="ts">
import { computed } from "vue";
import AgentCardBase from "@renderer/components/acp/AgentCardBase.vue";
import type { AcpAgentEntry, AcpAgentStatus, AcpInstallProgress } from "@shared/types/acp-agent";

const props = defineProps<{
  agent: AcpAgentEntry;
  icon?: string;
  agentStatus?: AcpAgentStatus;
  installProgress?: AcpInstallProgress;
  selected?: boolean;
  selectable?: boolean;
  installDisabled?: boolean;
}>();

const emit = defineEmits<{
  select: [agentId: string];
  install: [agentId: string];
}>();

const installed = computed(() => props.agentStatus?.installed === true);
const isInstalling = computed(() => {
  const status = props.installProgress?.status;
  return status === "downloading" || status === "installing";
});
const hasInstallError = computed(() => props.installProgress?.status === "error");
const progressMessage = computed(() => props.installProgress?.message ?? "正在处理...");

function handleClick(): void {
  if (!installed.value || !props.selectable) {
    return;
  }
  emit("select", props.agent.id);
}

function handleInstall(event: MouseEvent): void {
  event.stopPropagation();
  emit("install", props.agent.id);
}
</script>

<template>
  <AgentCardBase
    class="group relative transition-colors"
    :class="[
      installed && selectable ? 'cursor-pointer hover:border-primary/40' : '',
      selected ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : '',
    ]"
    :agent="agent"
    :icon="icon"
    @click="handleClick"
  >
    <template #actions>
      <div class="flex flex-col items-end gap-1.5">
        <template v-if="!installed">
          <div v-if="isInstalling" class="flex items-center gap-1 text-xs text-muted">
            <UIcon name="i-lucide-loader-circle" class="h-3.5 w-3.5 animate-spin" />
            <span class="max-w-24 truncate">{{ progressMessage }}</span>
          </div>

          <UButton
            v-else
            size="xs"
            :color="hasInstallError ? 'error' : 'neutral'"
            :variant="hasInstallError ? 'soft' : 'outline'"
            :disabled="installDisabled"
            :icon="hasInstallError ? 'i-lucide-rotate-ccw' : 'i-lucide-download'"
            @click="handleInstall"
          >
            {{ hasInstallError ? "重试" : "安装" }}
          </UButton>
        </template>
      </div>
    </template>

    <template v-if="selected" #corner>
      <UIcon name="i-lucide-check-circle-2" class="h-4 w-4 text-primary" />
    </template>
  </AgentCardBase>
</template>
