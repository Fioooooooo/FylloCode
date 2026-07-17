<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@nuxt/ui/composables";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import CreateTaskModal from "@renderer/components/task/CreateTaskModal.vue";
import TaskCard from "@renderer/components/task/TaskCard.vue";
import TaskDetailModal from "@renderer/components/task/TaskDetailModal.vue";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";
import { useProjectStore, useTaskStore } from "@renderer/stores";
import type { LinkedSessionEntry } from "@renderer/components/task/TaskCard.vue";
import type { LineageSessionLink, LineageTaskRef } from "@shared/types/lineage";
import type {
  CreateLocalTaskInput,
  TaskItem,
  TaskSource,
  TaskStatus,
  UpdateTaskInput,
} from "@shared/types/task";

interface TaskLinkState {
  links: LineageSessionLink[];
  loading: boolean;
  failed: boolean;
}

const router = useRouter();
const projectStore = useProjectStore();
const taskStore = useTaskStore();
const toast = useToast();
const { openChatSession } = useOpenChatSession();

const showCreateTaskModal = ref(false);
const showDetailModal = ref(false);
const activeDetailTask = ref<TaskItem | null>(null);
const selectedSource = ref<TaskSource>("local");
const taskLinkState = ref<Map<LineageTaskRef, TaskLinkState>>(new Map());
let linkedConversationBatchId = 0;

const statusItems: Array<{ label: string; value: TaskStatus }> = [
  { label: "打开", value: "open" },
  { label: "关闭", value: "closed" },
];

const sourceTabs = computed(() => taskStore.sourceTabs);
const visibleTasks = computed(() => taskStore.filteredTasks);
const isLocalSource = computed(() => selectedSource.value === "local");

function openCreateTaskModal(): void {
  showCreateTaskModal.value = true;
}

function buildTaskRef(task: TaskItem): LineageTaskRef {
  return taskStore.buildTaskRef(task);
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

async function handleCloseTask(task: TaskItem): Promise<void> {
  await taskStore.updateTask(task.id, { status: "closed" });
}

async function handleDeleteTask(task: TaskItem): Promise<void> {
  try {
    await taskStore.deleteTask(task.id);
    showDetailModal.value = false;
    taskStore.resetDetailState();
    activeDetailTask.value = null;
  } catch {
    // taskStore 已经持有错误状态，弹窗保持编辑态即可
  }
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
  try {
    await taskStore.startDiscussionFromTask(task);
    await router.push("/chat");
  } catch (error: unknown) {
    toast.add({
      title: "发起讨论失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}

function getLinkedSessionEntries(task: TaskItem): LinkedSessionEntry[] {
  const ref = buildTaskRef(task);
  const state = taskLinkState.value.get(ref);
  if (!state || state.links.length === 0) {
    return [];
  }

  return taskStore.getLinkedSessionEntries(state.links);
}

async function handleOpenSession(sessionId: string): Promise<void> {
  await openChatSession(sessionId);
}

async function loadLinkedConversations(): Promise<void> {
  const projectId = projectStore.currentProject?.id;
  if (!projectId) {
    taskLinkState.value = new Map();
    return;
  }

  const tasks = visibleTasks.value;
  const currentRefs = new Set(tasks.map(buildTaskRef));
  const nextState = new Map(taskLinkState.value);

  for (const ref of nextState.keys()) {
    if (!currentRefs.has(ref)) {
      nextState.delete(ref);
    }
  }

  linkedConversationBatchId += 1;
  const batchId = linkedConversationBatchId;

  await Promise.all(
    tasks.map(async (task) => {
      const ref = buildTaskRef(task);
      const existing = nextState.get(ref);
      nextState.set(ref, { links: existing?.links ?? [], loading: true, failed: false });

      try {
        const result = await taskStore.getTaskLineage(projectId, ref);
        if (batchId !== linkedConversationBatchId) {
          return;
        }

        const links = result.ok && result.data ? result.data.links : [];
        nextState.set(ref, { links, loading: false, failed: !(result.ok && result.data) });
      } catch {
        if (batchId !== linkedConversationBatchId) {
          return;
        }

        nextState.set(ref, { links: existing?.links ?? [], loading: false, failed: true });
      }
    })
  );

  if (batchId === linkedConversationBatchId) {
    taskLinkState.value = nextState;
  }
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

watch(
  () => [projectStore.currentProject?.id, visibleTasks.value.map((task) => task.id)] as const,
  () => {
    void loadLinkedConversations();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-default">
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader
            eyebrow="Tasks"
            title="任务看板"
            description="集中查看任务，并快速发起 AI 讨论。"
          />

          <UButton
            v-if="isLocalSource"
            color="primary"
            icon="i-lucide-plus"
            size="sm"
            @click="openCreateTaskModal"
          >
            新建任务
          </UButton>
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
          <URadioGroup
            v-model="taskStore.statusFilter"
            :items="statusItems"
            value-key="value"
            orientation="horizontal"
            color="primary"
          />
        </template>

        <UiSurface v-if="taskStore.loading" class="flex items-center justify-center py-8">
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            正在加载任务
          </div>
        </UiSurface>

        <div
          v-else-if="taskStore.error"
          class="rounded-lg border border-error/30 bg-error/5 px-4 py-4"
        >
          <div class="flex items-start gap-2 text-sm text-error">
            <UIcon name="i-lucide-circle-alert" class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ taskStore.error }}</span>
          </div>
        </div>

        <AppEmptyState
          v-else-if="visibleTasks.length === 0"
          icon="i-lucide-list-checks"
          title="暂无任务"
          :description="isLocalSource ? '创建一个新任务来开始追踪工作。' : '当前来源没有任务。'"
          :action-label="isLocalSource ? '新建任务' : undefined"
          action-icon="i-lucide-plus"
          @action="showCreateTaskModal = true"
        />

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            :task="task"
            :linked-sessions="getLinkedSessionEntries(task)"
            @view-detail="handleViewDetail"
            @start-discussion="startChatFromTask"
            @open-session="handleOpenSession"
            @close="handleCloseTask"
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
    @delete="handleDeleteTask"
    @update:open="handleDetailOpenChange"
  />
</template>
