<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import CreateTaskModal from "@renderer/components/task/CreateTaskModal.vue";
import TaskCard from "@renderer/components/task/TaskCard.vue";
import TaskDetailModal from "@renderer/components/task/TaskDetailModal.vue";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import { useTaskStore } from "@renderer/stores/task";
import { buildSourceDisplay } from "@renderer/utils/task";
import type { TaskItem, TaskSource, TaskStatus, UpdateTaskInput } from "@shared/types/task";

const router = useRouter();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const chatStore = useChatStore();
const taskStore = useTaskStore();

const showCreateTaskModal = ref(false);
const showDetailModal = ref(false);
const activeDetailTask = ref<TaskItem | null>(null);
const selectedSource = ref<TaskSource>("local");

const sourceTabs: Array<{ label: string; value: TaskSource }> = [
  { label: "本地", value: "local" },
  { label: "云效", value: "yunxiao" },
  { label: "GitHub", value: "github" },
];

const statusItems: Array<{ label: string; value: TaskStatus }> = [
  { label: "打开", value: "open" },
  { label: "关闭", value: "closed" },
];

const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60 * 1000);
const hoursAgo = (n: number): Date => new Date(Date.now() - n * 60 * 60 * 1000);
const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const mockYunxiaoTasks: TaskItem[] = [
  {
    id: "mock-yx-1",
    projectId: "mock",
    title: "API 网关在高并发下出现间歇性 502",
    description:
      "线上环境 P0 故障：网关在 QPS > 5000 时出现 502 错误，初步定位为 upstream 连接池耗尽。需要紧急排查并验证修复方案。",
    status: "open",
    source: "yunxiao",
    sourceMeta: {
      source: "yunxiao",
      url: "https://devops.aliyun.com/projex/req/YX-1024",
      key: "YX-1024",
      issueType: "缺陷",
    },
    labels: [
      { id: "yx-l-1", name: "P0" },
      { id: "yx-l-2", name: "线上故障" },
      { id: "yx-l-3", name: "网关" },
    ],
    proposalId: "abc123",
    createdAt: minutesAgo(35),
    updatedAt: minutesAgo(5),
  },
  {
    id: "mock-yx-2",
    projectId: "mock",
    title: "支持自定义流水线步骤模板",
    description: "希望可以基于团队已有模板快速创建流水线，减少重复配置。",
    status: "open",
    source: "yunxiao",
    sourceMeta: {
      source: "yunxiao",
      url: "https://devops.aliyun.com/projex/req/YX-2331",
      key: "YX-2331",
      issueType: "需求",
    },
    labels: [{ id: "yx-l-4", name: "需求" }],
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(2),
  },
  {
    id: "mock-yx-3",
    projectId: "mock",
    title: "排查 release-2025-04 部署超时",
    description: "",
    status: "open",
    source: "yunxiao",
    sourceMeta: {
      source: "yunxiao",
      key: "YX-2089",
      issueType: "任务",
    },
    labels: [],
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
  },
];

const mockGithubTasks: TaskItem[] = [
  {
    id: "mock-gh-1",
    projectId: "mock",
    title: "feat(api): support streaming responses for /v1/messages",
    description:
      "Adds Server-Sent Events streaming for the messages endpoint, mirroring the OpenAI SSE schema. Includes integration tests and updates the SDK examples.",
    status: "open",
    source: "github",
    sourceMeta: {
      source: "github",
      url: "https://github.com/example/repo/pull/421",
      repository: "example/repo",
      number: 421,
      issueType: "pull_request",
    },
    labels: [
      { id: "gh-l-1", name: "feature" },
      { id: "gh-l-2", name: "needs-review" },
    ],
    proposalId: "def456",
    createdAt: hoursAgo(8),
    updatedAt: minutesAgo(45),
  },
  {
    id: "mock-gh-2",
    projectId: "mock",
    title: "Memory leak in long-running watch mode",
    description:
      "Steps to reproduce: 1) start the dev server with `--watch`, 2) edit any file every few seconds for ~10 minutes. RSS climbs steadily to >2GB.",
    status: "open",
    source: "github",
    sourceMeta: {
      source: "github",
      url: "https://github.com/example/repo/issues/137",
      repository: "example/repo",
      number: 137,
      issueType: "issue",
    },
    labels: [],
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
  },
  {
    id: "mock-gh-3",
    projectId: "mock",
    title: "[Discussion] Roadmap for plugin marketplace",
    description: "",
    status: "open",
    source: "github",
    sourceMeta: {
      source: "github",
      url: "https://github.com/example/repo/issues/89",
      repository: "example/repo",
      number: 89,
      issueType: "issue",
    },
    labels: [
      { id: "gh-l-3", name: "discussion" },
      { id: "gh-l-4", name: "roadmap" },
      { id: "gh-l-5", name: "good first issue" },
    ],
    createdAt: daysAgo(7),
    updatedAt: daysAgo(2),
  },
];

function buildTaskPrompt(task: TaskItem): string {
  const sourceDisplay = buildSourceDisplay(task);
  const url =
    task.source !== "local" && "url" in task.sourceMeta && task.sourceMeta.url
      ? ` (${task.sourceMeta.url})`
      : "";

  const sections = [
    "请帮我分析并实现这个任务：",
    "",
    `**来源**: ${sourceDisplay}${url}`,
    `**标题**: ${task.title}`,
  ];

  if (task.description.trim()) {
    sections.push("", "**描述**:", task.description.trim());
  }

  sections.push(
    "",
    "请帮我：",
    "1. 分析这个任务的技术实现方案",
    "2. 如果合适，创建一个 OpenSpec proposal 来规划实现步骤"
  );

  return sections.join("\n");
}

async function loadCurrentSource(source: TaskSource = selectedSource.value): Promise<void> {
  await taskStore.loadTasks(source);
}

async function handleSourceChange(source: string | number): Promise<void> {
  const nextSource = source as TaskSource;
  selectedSource.value = nextSource;
  await loadCurrentSource(nextSource);
}

async function handleCreateTask(input: { title: string; description?: string }): Promise<void> {
  await taskStore.createTask(input);
  showCreateTaskModal.value = false;

  if (selectedSource.value === "yunxiao" || selectedSource.value === "github") {
    selectedSource.value = "local";
  }

  await loadCurrentSource();
}

async function handleDeleteTask(task: TaskItem): Promise<void> {
  await taskStore.deleteTask(task.id);
}

function handleViewDetail(task: TaskItem): void {
  activeDetailTask.value = task;
  showDetailModal.value = true;
}

async function handleSaveDetail(payload: {
  taskId: string;
  updates: UpdateTaskInput;
}): Promise<void> {
  try {
    const updatedTask = await taskStore.updateTask(payload.taskId, payload.updates);
    activeDetailTask.value = updatedTask;
  } catch {
    // taskStore 已经持有错误状态，弹窗保持编辑态即可
  }
}

async function startChatFromTask(task: TaskItem): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) {
    return;
  }

  sessionStore.beginDraftSession();
  await chatStore.sendMessage(buildTaskPrompt(task));
  await router.push("/chat");
}

watch(
  () => projectStore.currentProject?.id,
  () => {
    void loadCurrentSource();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-default">
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-240 mx-auto px-6 py-8 space-y-6">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold text-highlighted">任务面板</h1>
          <p class="text-sm text-muted">集中查看本地任务，并快速发起 AI 讨论。</p>
        </div>

        <div class="space-y-2">
          <UTabs
            v-model="selectedSource"
            :items="sourceTabs"
            value-key="value"
            variant="pill"
            size="sm"
            @update:model-value="handleSourceChange"
          />
        </div>

        <template v-if="selectedSource === 'local'">
          <div class="flex items-center gap-6">
            <UButton
              color="primary"
              icon="i-lucide-plus"
              size="sm"
              @click="showCreateTaskModal = true"
            >
              新建任务
            </UButton>
            <URadioGroup
              v-model="taskStore.statusFilter"
              :items="statusItems"
              value-key="value"
              orientation="horizontal"
              color="primary"
            />
          </div>

          <div
            v-if="taskStore.loading"
            class="rounded-lg border border-default bg-elevated px-4 py-8"
          >
            <div class="flex items-center justify-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              正在加载任务
            </div>
          </div>

          <div
            v-else-if="taskStore.error"
            class="rounded-lg border border-error/30 bg-error/5 px-4 py-4"
          >
            <div class="flex items-start gap-2 text-sm text-error">
              <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
              <span>{{ taskStore.error }}</span>
            </div>
          </div>

          <div
            v-else-if="taskStore.filteredTasks.length === 0"
            class="rounded-lg border border-default bg-elevated px-4 py-10 text-center space-y-3"
          >
            <UIcon name="i-lucide-list-checks" class="w-10 h-10 text-muted mx-auto" />
            <p class="text-sm text-muted">暂无任务</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
            <TaskCard
              v-for="task in taskStore.filteredTasks"
              :key="task.id"
              :task="task"
              @view-detail="handleViewDetail"
              @start-discussion="startChatFromTask"
              @delete="handleDeleteTask"
            />
          </div>
        </template>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
          <TaskCard
            v-for="task in selectedSource === 'yunxiao' ? mockYunxiaoTasks : mockGithubTasks"
            :key="task.id"
            :task="task"
            @view-detail="handleViewDetail"
            @start-discussion="startChatFromTask"
          />
        </div>
      </div>
    </div>
  </div>

  <CreateTaskModal v-model:open="showCreateTaskModal" @create="handleCreateTask" />
  <TaskDetailModal
    v-model:open="showDetailModal"
    :task="activeDetailTask"
    :error="taskStore.error"
    @save="handleSaveDetail"
  />
</template>
