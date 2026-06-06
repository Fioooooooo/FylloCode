<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import AgentPickerCard from "./AgentPickerCard.vue";

const open = defineModel<boolean>("open", { required: true });

const props = defineProps<{
  currentAgentId?: string | null;
}>();

const emit = defineEmits<{
  confirm: [agentId: string];
}>();

const store = useAcpAgentsStore();
const { registry, statuses, icons, installProgress } = storeToRefs(store);

const search = ref("");
const stagedAgentId = ref<string | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    search.value = "";
    stagedAgentId.value = props.currentAgentId ?? null;
  }
});

const allAgents = computed(() => registry.value?.agents ?? []);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) {
    return allAgents.value;
  }
  return allAgents.value.filter(
    (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
  );
});

const installedAgents = computed(() =>
  filtered.value.filter((a) => statuses.value[a.id]?.installed === true)
);

const notInstalledAgents = computed(() =>
  filtered.value.filter((a) => statuses.value[a.id]?.installed !== true)
);

const currentInstallingId = computed(
  () =>
    Object.values(installProgress.value).find(
      (p) => p.status === "downloading" || p.status === "installing"
    )?.agentId ?? null
);

const confirmDisabled = computed(() => !stagedAgentId.value);

function handleSelect(agentId: string): void {
  stagedAgentId.value = agentId;
}

function handleInstall(agentId: string): void {
  void store.installAgent(agentId);
}

function handleCancel(): void {
  open.value = false;
}

function handleConfirm(): void {
  if (!stagedAgentId.value) {
    return;
  }
  emit("confirm", stagedAgentId.value);
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="全部 Agents"
    description="搜索、安装并切换不同的 ACP Agent。"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UInput v-model="search" size="sm" placeholder="按名称搜索..." icon="i-lucide-search" />

        <div class="space-y-4 pr-1">
          <section v-if="installedAgents.length > 0" class="space-y-3">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-medium text-muted">已安装</h3>
              <span class="text-xs text-muted/60">{{ installedAgents.length }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <AgentPickerCard
                v-for="agent in installedAgents"
                :key="agent.id"
                :agent="agent"
                :icon="icons[agent.id]"
                :agent-status="statuses[agent.id]"
                selectable
                :selected="stagedAgentId === agent.id"
                @select="handleSelect"
              />
            </div>
          </section>

          <section v-if="notInstalledAgents.length > 0" class="space-y-3">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-medium text-muted">未安装</h3>
              <span class="text-xs text-muted/60">{{ notInstalledAgents.length }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <AgentPickerCard
                v-for="agent in notInstalledAgents"
                :key="agent.id"
                :agent="agent"
                :icon="icons[agent.id]"
                :agent-status="statuses[agent.id]"
                :install-progress="installProgress[agent.id]"
                :install-disabled="!!currentInstallingId && currentInstallingId !== agent.id"
                @install="handleInstall"
              />
            </div>
          </section>

          <div
            v-if="installedAgents.length === 0 && notInstalledAgents.length === 0"
            class="py-12 text-center text-sm text-muted"
          >
            没有匹配的 Agent
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton variant="ghost" color="neutral" @click="handleCancel">取消</UButton>
      <UButton color="primary" :disabled="confirmDisabled" @click="handleConfirm">确定</UButton>
    </template>
  </UModal>
</template>
