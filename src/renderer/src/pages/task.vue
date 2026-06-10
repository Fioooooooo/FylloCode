<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@nuxt/ui/composables";
import CreateTaskModal from "@renderer/components/task/CreateTaskModal.vue";
import TaskCard from "@renderer/components/task/TaskCard.vue";
import TaskDetailModal from "@renderer/components/task/TaskDetailModal.vue";
import { lineageApi } from "@renderer/api/lineage";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";
import { useTaskStore } from "@renderer/stores/task";
import { buildSourceDisplay, getTaskDescriptionPlainText } from "@renderer/utils/task";
import type { LineageTaskRef, LineageTaskSnapshot } from "@shared/types/lineage";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  TaskStatus,
  UpdateTaskInput,
} from "@shared/types/task";

const router = useRouter();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const chatStore = useChatStore();
const taskStore = useTaskStore();
const toast = useToast();

const showCreateTaskModal = ref(false);
const showDetailModal = ref(false);
const activeDetailTask = ref<TaskItem | null>(null);
const selectedSource = ref<TaskSource>("local");

const statusItems: Array<{ label: string; value: TaskStatus }> = [
  { label: "打开", value: "open" },
  { label: "关闭", value: "closed" },
];

const sourceTabs = computed(() => taskStore.sourceTabs);
const visibleTasks = computed(() => taskStore.filteredTasks);
const isLocalSource = computed(() => selectedSource.value === "local");

function buildTaskPrompt(task: TaskItem): string {
  const sourceDisplay = buildSourceDisplay(task);
  const descriptionText = getTaskDescriptionPlainText(task.description);
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

  if (descriptionText) {
    sections.push("", "**描述**:", descriptionText);
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
  if (!taskStore.availableSources.includes(selectedSource.value)) {
    selectedSource.value = "local";
  }
}

async function handleSourceChange(source: string | number): Promise<void> {
  const nextSource = source as TaskSource;
  selectedSource.value = nextSource;
  await loadCurrentSource(nextSource);
}

async function handleCreateTask(input: CreateLocalTaskInput): Promise<void> {
  await taskStore.createTask(input);
  showCreateTaskModal.value = false;

  if (selectedSource.value !== "local") {
    selectedSource.value = "local";
  }

  await loadCurrentSource();
}

async function handleDeleteTask(task: TaskItem): Promise<void> {
  await taskStore.deleteTask(task.id);
}

async function handleViewDetail(task: TaskItem): Promise<void> {
  activeDetailTask.value = task;
  showDetailModal.value = true;

  if (task.source !== "yunxiao") {
    return;
  }

  try {
    activeDetailTask.value = await taskStore.loadTaskDetail(task.id);
  } catch {
    // 详情错误由 taskStore 的独立详情状态承载，弹窗保持打开。
  }
}

async function handleSaveDetail(payload: {
  taskId: string;
  updates: UpdateTaskInput;
}): Promise<void> {
  try {
    const updatedTask = await taskStore.updateTask(payload.taskId, payload.updates);
    activeDetailTask.value = updatedTask;
    toast.add({ title: "保存成功", color: "success" });
    showDetailModal.value = false;
  } catch {
    // taskStore 已经持有错误状态，弹窗保持编辑态即可
  }
}

function handleDetailOpenChange(open: boolean): void {
  showDetailModal.value = open;
  if (open) {
    return;
  }

  taskStore.resetDetailState();
  activeDetailTask.value = null;
}

async function startChatFromTask(task: TaskItem): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) {
    return;
  }

  const taskRef = `${task.source}:${task.id}` as LineageTaskRef;
  const snapshot: LineageTaskSnapshot = {
    ref: taskRef,
    snapshot: JSON.parse(JSON.stringify(task)) as TaskItem,
    capturedAt: new Date().toISOString(),
  };

  try {
    const result = await lineageApi.ensureTaskSubject(projectId, snapshot);
    if (!result.ok) {
      throw new Error(result.error.message || result.error.code);
    }
  } catch (error: unknown) {
    toast.add({
      title: "发起讨论失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
    return;
  }

  sessionStore.beginDraftSession();
  await chatStore.sendMessage([{ type: "text", text: buildTaskPrompt(task) }], { taskRef });
  await router.push("/chat");
}

watch(
  () => projectStore.currentProject?.id,
  () => {
    taskStore.resetDetailState();
    activeDetailTask.value = null;
    showDetailModal.value = false;
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
          <h1 class="text-2xl font-bold text-highlighted">任务看板</h1>
          <p class="text-sm text-muted">集中查看任务，并快速发起 AI 讨论。</p>
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

        <template v-if="isLocalSource">
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
        </template>

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
          v-else-if="visibleTasks.length === 0"
          class="rounded-lg border border-default bg-elevated px-4 py-10 text-center space-y-3"
        >
          <UIcon name="i-lucide-list-checks" class="w-10 h-10 text-muted mx-auto" />
          <p class="text-sm text-muted">暂无任务</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            :task="task"
            @view-detail="handleViewDetail"
            @start-discussion="startChatFromTask"
            @delete="handleDeleteTask"
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
    :detail-loading="taskStore.detailLoadingTaskId === activeDetailTask?.id"
    :detail-error="
      taskStore.detailErrorTaskId === activeDetailTask?.id ? taskStore.detailErrorMessage : null
    "
    @save="handleSaveDetail"
    @update:open="handleDetailOpenChange"
  />
</template>
