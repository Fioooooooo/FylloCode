<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useMonaco } from "stream-monaco";
import { useToast } from "@nuxt/ui/composables";
import { useAcpAgentsStore } from "@renderer/stores/acp-agents";
import type { AcpCustomAgentsJson } from "@shared/types/acp-agent";
import AgentCard from "./AgentCard.vue";

const store = useAcpAgentsStore();
const toast = useToast();
const refreshing = ref(false);
const searchQuery = ref("");
const activeTab = ref("all");

const tabs = [
  { label: "全部", value: "all" },
  { label: "已安装", value: "installed" },
  { label: "自定义", value: "custom" },
];

const agents = computed(() => store.registry?.agents ?? []);
const currentMutatingAgentId = computed(() => {
  const installing = Object.values(store.installProgress).find(
    (progress) => progress.status === "downloading" || progress.status === "installing"
  )?.agentId;
  if (installing) {
    return installing;
  }

  return (
    Object.values(store.uninstallProgress).find((progress) => progress.status === "uninstalling")
      ?.agentId ?? null
  );
});
const hasRegistryError = computed(
  () =>
    !store.registryLoading &&
    !agents.value.length &&
    !!(store.initializationError || store.registryError)
);

const filteredAgents = computed(() => {
  let result = agents.value;
  if (activeTab.value === "installed") {
    result = result.filter((a) => store.statuses[a.id]?.installed);
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter((a) => a.name.toLowerCase().includes(q));
  }
  return result;
});

onMounted(() => {
  if (!store.initialized && !store.initializing) {
    void store.ensureInitialized();
  }
});

async function refreshStatuses(): Promise<void> {
  refreshing.value = true;
  try {
    await store.refreshAll();
  } finally {
    refreshing.value = false;
  }
}

// Custom tab editor state
const isCustomTab = computed(() => activeTab.value === "custom");
const customEditorContainer = ref<HTMLElement | null>(null);
const customAgentsJson = ref(JSON.stringify({ agent_servers: {} }, null, 2));
const customAgentsSaving = ref(false);
const customAgentsError = ref<string | null>(null);

const { createEditor, cleanupEditor, getCode } = useMonaco({
  languages: ["json"],
  themes: ["vitesse-light", "vitesse-dark"],
  readOnly: false,
  MAX_HEIGHT: 480,
  minimap: { enabled: false },
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
    alwaysConsumeMouseWheel: false,
  },
  wordWrap: "on",
  automaticLayout: true,
});

async function loadCustomAgentsEditor(): Promise<void> {
  if (!isCustomTab.value) {
    return;
  }

  customAgentsError.value = null;
  try {
    const config = await store.loadCustomAgents();
    const nextJson = JSON.stringify(config ?? { agent_servers: {} }, null, 2);
    customAgentsJson.value = nextJson;
    await nextTick();
    if (customEditorContainer.value) {
      await createEditor(customEditorContainer.value, nextJson, "json");
    }
  } catch (error: unknown) {
    customAgentsError.value = error instanceof Error ? error.message : String(error);
  }
}

async function disposeCustomEditor(): Promise<void> {
  cleanupEditor();
}

watch(isCustomTab, async (active) => {
  if (active) {
    await loadCustomAgentsEditor();
  } else {
    await disposeCustomEditor();
  }
});

onUnmounted(() => {
  disposeCustomEditor();
});

async function saveCustomAgents(): Promise<void> {
  const raw = getCode();
  const text = typeof raw === "string" ? raw : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    customAgentsError.value = `JSON 格式错误: ${error instanceof Error ? error.message : String(error)}`;
    toast.add({
      title: "保存失败",
      description: customAgentsError.value,
      color: "error",
    });
    return;
  }

  customAgentsSaving.value = true;
  customAgentsError.value = null;
  try {
    await store.saveCustomAgents(parsed as AcpCustomAgentsJson);
    toast.add({
      title: "保存成功",
      description: "自定义 Agent 配置已更新。",
      color: "success",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    customAgentsError.value = message;
    toast.add({
      title: "保存失败",
      description: message,
      color: "error",
    });
  } finally {
    customAgentsSaving.value = false;
  }
}

const exampleConfig = `{
  "agent_servers": {
    "Kimi Code CLI": {
      "command": "~/.local/bin/kimi",
      "args": ["acp"],
      "env": {}
    }
  }
}`;
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">ACP Agents</h2>
        <p class="text-sm text-muted mt-0.5">支持 Agent Client Protocol 的 CLI Agent。</p>
      </div>
      <UButton
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-refresh-cw"
        :loading="refreshing"
        @click="refreshStatuses"
      >
        刷新
      </UButton>
    </div>

    <div class="flex items-center gap-3 mb-4">
      <UInput
        v-if="!isCustomTab"
        v-model="searchQuery"
        size="sm"
        placeholder="搜索 Agent..."
        icon="i-lucide-search"
        class="flex-1"
      />
      <div v-else class="flex-1" />
      <UTabs v-model="activeTab" :items="tabs" size="sm" variant="link" value-key="value" />
    </div>

    <div v-if="!isCustomTab">
      <div
        v-if="store.registryLoading && !agents.length"
        class="flex items-center justify-center py-16"
      >
        <UIcon name="i-lucide-loader-circle" class="w-6 h-6 text-muted animate-spin" />
      </div>

      <div v-else-if="hasRegistryError" class="flex items-center justify-center py-16">
        <p class="text-sm text-muted">{{ store.registryError }}</p>
      </div>

      <template v-else>
        <div v-if="filteredAgents.length" class="grid grid-cols-2 gap-4">
          <AgentCard
            v-for="agent in filteredAgents"
            :key="agent.id"
            :agent="agent"
            :icon="store.icons[agent.id]"
            :agent-status="store.statuses[agent.id]"
            :install-progress="store.installProgress[agent.id] ?? store.uninstallProgress[agent.id]"
            :user-data-path="store.userDataPath"
            :is-installing="currentMutatingAgentId === agent.id"
            :action-disabled="!!currentMutatingAgentId && currentMutatingAgentId !== agent.id"
            @install="store.installAgent"
            @uninstall="store.uninstallAgent"
          />
        </div>
        <div v-else class="flex items-center justify-center py-16">
          <p class="text-sm text-muted">没有匹配的 Agent</p>
        </div>
      </template>
    </div>

    <div v-else class="space-y-4">
      <div v-if="customAgentsError" class="flex items-center justify-center py-16">
        <p class="text-sm text-error">{{ customAgentsError }}</p>
      </div>

      <template v-else>
        <div
          ref="customEditorContainer"
          class="border border-default rounded-lg overflow-hidden h-120!"
        />

        <div class="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
          <p class="font-medium text-highlighted">字段说明</p>
          <ul class="space-y-1.5 text-muted list-disc list-inside">
            <li>
              <code class="text-highlighted bg-default px-1 rounded">command</code>：Agent
              可执行文件路径，支持
              <code class="text-highlighted bg-default px-1 rounded">~</code>
              展开与 PATH 查找（必填）
            </li>
            <li>
              <code class="text-highlighted bg-default px-1 rounded">args</code>：启动参数数组，如
              <code class="text-highlighted bg-default px-1 rounded">["acp"]</code>（可选）
            </li>
            <li>
              <code class="text-highlighted bg-default px-1 rounded">env</code
              >：额外环境变量，会合并到系统环境变量之上（可选）
            </li>
          </ul>
          <pre class="mt-2 rounded bg-default p-3 text-xs font-mono text-muted overflow-auto">{{
            exampleConfig
          }}</pre>
        </div>

        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="i-lucide-save"
            :loading="customAgentsSaving"
            @click="saveCustomAgents"
          >
            保存
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
