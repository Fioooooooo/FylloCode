<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ChatComark from "@renderer/components/chat/ChatComark";
import { proposalApi } from "@renderer/api/proposal";
import { useProjectStore } from "@renderer/stores/project";
import { useProposalStore } from "@renderer/stores/proposal";
import { useWorkflowStore } from "@renderer/stores/workflow";
import type { ProposalMeta, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowTemplate } from "@shared/types/workflow";

type MarkdownTabValue = "proposal" | "design" | "tasks";

interface MarkdownTab {
  label: string;
  value: MarkdownTabValue;
  filename: string;
  content: string | null;
}

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const proposalStore = useProposalStore();
const workflowStore = useWorkflowStore();
const activeTab = ref<MarkdownTabValue>("proposal");
const tabs = ref<MarkdownTab[]>([]);
const loadingFiles = ref(false);
const fileError = ref<string | null>(null);

// Side panel state
const sidePanelOpen = ref(false);
const activeWorkflow = ref<WorkflowTemplate | null>(null);
const activeStageIndex = ref(0);

// Placeholder log entries for side panel UI
const mockLogs = [
  { id: 1, type: "thinking", text: "正在分析 tasks.md，理解实现步骤..." },
  { id: 2, type: "tool", text: "调用工具 read_file: tasks.md" },
  { id: 3, type: "output", text: "找到 12 个任务，当前处理第 1 个：初始化项目结构" },
  { id: 4, type: "thinking", text: "思考如何创建目录结构..." },
  { id: 5, type: "tool", text: "调用工具 write_file: src/components/WorkflowPanel.vue" },
  { id: 6, type: "output", text: "文件已创建" },
];

const statusConfig: Record<
  ProposalStatus,
  {
    label: string;
    color: "neutral" | "primary" | "warning" | "success" | "error" | "info" | "secondary";
    variant: "soft" | "outline" | "subtle";
  }
> = {
  creating: { label: "创建中", color: "primary", variant: "soft" },
  draft: { label: "草稿", color: "neutral", variant: "soft" },
  applying: { label: "实现中", color: "warning", variant: "soft" },
  archived: { label: "已归档", color: "neutral", variant: "outline" },
};

const isApplying = computed(() => currentProposal.value?.status === "applying");

const workflowMenuItems = computed(() => {
  const groups = [];
  if (workflowStore.customTemplates.length > 0) {
    groups.push(
      workflowStore.customTemplates.map((t) => ({
        label: t.name,
        onSelect: () => startWithWorkflow(t),
      }))
    );
  }
  if (workflowStore.builtInTemplates.length > 0) {
    groups.push(
      workflowStore.builtInTemplates.map((t) => ({
        label: t.name,
        onSelect: () => startWithWorkflow(t),
      }))
    );
  }
  return groups;
});

function startWithWorkflow(workflow: WorkflowTemplate): void {
  // Static UI only: set mock active state
  activeWorkflow.value = workflow;
  activeStageIndex.value = 0;
  sidePanelOpen.value = true;
}

function openSidePanel(): void {
  sidePanelOpen.value = true;
}

function closeSidePanel(): void {
  sidePanelOpen.value = false;
}

const changeId = computed(() => {
  const value = (route.params as { id?: string | string[] }).id;
  return Array.isArray(value) ? value[0] : value;
});

const currentProposal = computed<ProposalMeta | null>(() => {
  return proposalStore.proposals.find((proposal) => proposal.id === changeId.value) ?? null;
});

const visibleTabs = computed(() =>
  tabs.value
    .filter((tab) => tab.content !== null)
    .map((tab) => ({
      label: tab.label,
      value: tab.value,
    }))
);

const activeContent = computed(() => {
  return tabs.value.find((tab) => tab.value === activeTab.value)?.content ?? "";
});

async function ensureProposalLoaded(): Promise<void> {
  if (proposalStore.proposals.length > 0) {
    return;
  }

  await proposalStore.loadProposals();
}

async function loadMarkdownFiles(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  const changeIdSnapshot = changeId.value;
  if (!projectId || !changeIdSnapshot) {
    return;
  }

  loadingFiles.value = true;
  fileError.value = null;

  try {
    const fileRequests: Omit<MarkdownTab, "content">[] = [
      { label: "Proposal", value: "proposal", filename: "proposal.md" },
      { label: "Design", value: "design", filename: "design.md" },
      { label: "Tasks", value: "tasks", filename: "tasks.md" },
    ];

    const results = await Promise.all(
      fileRequests.map(async (tab) => {
        const result = await proposalApi.readFile(projectId, changeIdSnapshot, tab.filename);
        if (!result.ok) {
          throw new Error(result.error.message);
        }

        return {
          ...tab,
          content: result.data,
        };
      })
    );

    tabs.value = results;
    activeTab.value = visibleTabs.value[0]?.value ?? "proposal";
  } catch (err: unknown) {
    fileError.value = err instanceof Error ? err.message : String(err);
    tabs.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

function backToList(): void {
  void router.push("/proposal");
}

onMounted(() => {
  void (async () => {
    await ensureProposalLoaded();
    await loadMarkdownFiles();
    await workflowStore.fetchTemplates();
  })();
});
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-default">
    <!-- Left: full proposal -->
    <div class="flex flex-col flex-1 overflow-hidden min-w-0">
      <!-- Header -->
      <div class="shrink-0 border-b border-default">
        <div class="max-w-3xl mx-auto px-6 py-5 space-y-3">
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-arrow-left"
              @click="backToList"
            >
              返回
            </UButton>
          </div>
          <div v-if="currentProposal" class="flex items-start justify-between gap-4">
            <h1 class="text-xl font-semibold text-highlighted">{{ currentProposal.title }}</h1>
            <div class="flex items-center gap-2 shrink-0 mt-0.5">
              <UBadge
                :color="statusConfig[currentProposal.status].color"
                :variant="statusConfig[currentProposal.status].variant"
              >
                {{ statusConfig[currentProposal.status].label }}
              </UBadge>
              <UDropdownMenu
                v-if="currentProposal.status === 'draft'"
                :items="workflowMenuItems"
                :loading="workflowStore.isLoading"
              >
                <UButton
                  size="xs"
                  color="primary"
                  icon="i-lucide-play"
                  trailing-icon="i-lucide-chevron-down"
                >
                  开始实现
                </UButton>
              </UDropdownMenu>
            </div>
          </div>
          <div v-if="currentProposal" class="flex items-center gap-4 text-sm text-muted">
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
              {{ currentProposal.date }}
            </span>
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-check-square" class="w-3.5 h-3.5" />
              {{ currentProposal.doneTasks }}/{{ currentProposal.totalTasks }} tasks
            </span>
          </div>
          <div v-else class="space-y-2">
            <h1 class="text-xl font-semibold text-highlighted">{{ changeId }}</h1>
            <p class="text-sm text-muted">未找到该 proposal 的元数据</p>
          </div>
        </div>

        <!-- Applying status bar -->
        <button
          v-if="isApplying && activeWorkflow"
          class="w-full border-t border-warning/20 bg-warning/8 hover:bg-warning/12 transition-colors cursor-pointer"
          @click="openSidePanel"
        >
          <div class="max-w-3xl mx-auto px-6 py-2 flex items-center gap-2 text-sm">
            <span class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
            <span class="text-warning font-medium">{{ activeWorkflow.name }}</span>
            <span class="text-muted mx-1">·</span>
            <span class="text-muted">
              阶段 {{ activeStageIndex + 1 }}/{{ activeWorkflow.stages.length }}：{{
                activeWorkflow.stages[activeStageIndex]?.name ?? "准备中"
              }}
            </span>
            <UIcon name="i-lucide-panel-right-open" class="w-3.5 h-3.5 text-muted ml-auto" />
          </div>
        </button>
      </div>

      <!-- Tabs -->
      <div class="shrink-0">
        <div class="max-w-3xl mx-auto px-6">
          <UTabs
            v-if="visibleTabs.length > 0"
            v-model="activeTab"
            :items="visibleTabs"
            variant="link"
            value-key="value"
          />
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto px-6 py-6">
          <div
            v-if="loadingFiles"
            class="flex items-center justify-center gap-2 py-12 text-sm text-muted"
          >
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            正在加载 markdown
          </div>

          <div v-else-if="fileError" class="rounded-lg border border-error/30 bg-error/5 px-4 py-4">
            <div class="flex items-start gap-2 text-sm text-error">
              <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
              <span>{{ fileError }}</span>
            </div>
          </div>

          <div
            v-else-if="visibleTabs.length === 0"
            class="rounded-lg border border-default bg-elevated px-4 py-8 text-center text-sm text-muted"
          >
            暂无可展示的 markdown 文件
          </div>

          <div v-else class="prose prose-sm dark:prose-invert max-w-none">
            <ChatComark :markdown="activeContent" />
          </div>
        </div>
      </div>
    </div>

    <!-- Right: side panel -->
    <div
      v-if="sidePanelOpen && activeWorkflow"
      class="flex flex-col w-96 shrink-0 border-l border-default bg-default overflow-hidden"
    >
      <!-- Panel header -->
      <div
        class="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-default"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
          <span class="text-sm font-medium text-highlighted truncate">{{
            activeWorkflow.name
          }}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="text-xs text-muted">
            {{ activeStageIndex + 1 }}/{{ activeWorkflow.stages.length }}
          </span>
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            @click="closeSidePanel"
          />
        </div>
      </div>

      <!-- Stage progress -->
      <div class="shrink-0 px-4 py-2 border-b border-default bg-elevated/50">
        <div class="flex items-center gap-1.5">
          <template v-for="(stage, i) in activeWorkflow.stages" :key="stage.id">
            <div
              class="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              :class="
                i < activeStageIndex
                  ? 'bg-success/10 text-success'
                  : i === activeStageIndex
                    ? 'bg-warning/10 text-warning font-medium'
                    : 'bg-elevated text-muted'
              "
            >
              <UIcon v-if="i < activeStageIndex" name="i-lucide-check" class="w-3 h-3" />
              <span
                v-else-if="i === activeStageIndex"
                class="w-1.5 h-1.5 rounded-full bg-current"
              />
              <span>{{ stage.name }}</span>
            </div>
            <UIcon
              v-if="i < activeWorkflow.stages.length - 1"
              name="i-lucide-chevron-right"
              class="w-3 h-3 text-muted shrink-0"
            />
          </template>
        </div>
      </div>

      <!-- Log stream -->
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <div v-for="log in mockLogs" :key="log.id" class="flex items-start gap-2 text-xs">
          <template v-if="log.type === 'thinking'">
            <UIcon name="i-lucide-brain" class="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <span class="text-muted italic">{{ log.text }}</span>
          </template>
          <template v-else-if="log.type === 'tool'">
            <UIcon name="i-lucide-wrench" class="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
            <span class="text-muted font-mono">{{ log.text }}</span>
          </template>
          <template v-else>
            <UIcon name="i-lucide-terminal" class="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
            <span class="text-default">{{ log.text }}</span>
          </template>
        </div>
        <!-- Cursor indicator -->
        <div class="flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
          <span>正在执行...</span>
        </div>
      </div>
    </div>
  </div>
</template>
