<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { buildSourceDisplay } from "@renderer/utils/task";
import { timeAgo } from "@renderer/utils/time";
import type {
  TaskDescriptionFormat,
  TaskItem,
  TaskStatus,
  UpdateTaskInput,
} from "@shared/types/task";
import type { WorkspaceFolderInfo } from "@shared/types/workspace";

const props = withDefaults(
  defineProps<{
    open: boolean;
    task: TaskItem | null;
    error?: string | null;
    detailLoading?: boolean;
    detailError?: string | null;
    folders?: WorkspaceFolderInfo[];
  }>(),
  { folders: () => [] }
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [{ taskId: string; updates: UpdateTaskInput }];
  delete: [task: TaskItem];
}>();

const confirmDialog = useConfirmDialog();

const statusItems: Array<{ label: string; value: TaskStatus }> = [
  { label: "打开", value: "open" },
  { label: "关闭", value: "closed" },
];

const mode = ref<"view" | "edit">("view");
const title = ref("");
const description = ref("");
const status = ref<TaskStatus>("open");
const titleError = ref("");
const targetFolderIds = ref<string[]>([]);

const isLocalTask = computed(() => props.task?.source === "local");
const canEdit = computed(() => Boolean(props.task && isLocalTask.value));
const canSave = computed(() => Boolean(title.value.trim()));
const sourceDisplay = computed(() => (props.task ? buildSourceDisplay(props.task) : ""));
const modalTitle = computed(() => {
  if (mode.value === "edit") {
    return "编辑任务";
  }

  return "任务详情";
});
const modalDescription = computed(() => {
  if (mode.value === "edit") {
    return props.task
      ? `修改「${props.task.title}」的标题、描述和状态。`
      : "修改任务的标题、描述和状态。";
  }

  if (!props.task) {
    return "查看任务的详情和状态。";
  }

  return `${props.task.title} · ${sourceDisplay.value} · ${props.task.status === "open" ? "打开" : "关闭"} · 创建于 ${timeAgo(props.task.createdAt)}`;
});
const editorContent = computed(() => props.task?.description.content ?? "");
const currentTargetFolders = computed(() =>
  (props.task?.currentTargetFolderIds ?? []).map(
    (folderId) =>
      props.folders.find((folder) => folder.folderId === folderId)?.folderName ?? folderId
  )
);
const staleTargetFolderIds = computed(() => props.task?.staleTargetFolderIds ?? []);
const targetOptions = computed(() => [
  ...props.folders.map((folder) => ({
    id: folder.folderId,
    label: folder.folderName,
    stale: false,
  })),
  ...staleTargetFolderIds.value
    .filter((folderId) => !props.folders.some((folder) => folder.folderId === folderId))
    .map((folderId) => ({ id: folderId, label: folderId, stale: true })),
]);
const editorContentType = computed<"html" | "markdown">(() => {
  return mapEditorContentType(props.task?.description.format);
});

function mapEditorContentType(format?: TaskDescriptionFormat): "html" | "markdown" {
  if (format === "html") {
    return "html";
  }

  return "markdown";
}

function resetForm(): void {
  title.value = "";
  description.value = "";
  titleError.value = "";
  targetFolderIds.value = [];
}

function resetState(): void {
  mode.value = "view";
  resetForm();
}

function close(): void {
  resetState();
  emit("update:open", false);
}

function startEditing(): void {
  if (!props.task || !isLocalTask.value) {
    return;
  }

  title.value = props.task.title;
  description.value = props.task.description.content;
  status.value = props.task.status;
  targetFolderIds.value = [...(props.task.targetFolderIds ?? [])];
  titleError.value = "";
  mode.value = "edit";
}

function toggleTarget(folderId: string, checked: boolean): void {
  targetFolderIds.value = checked
    ? [...targetFolderIds.value, folderId]
    : targetFolderIds.value.filter((id) => id !== folderId);
}

function cancelEditing(): void {
  resetState();
}

function submit(): void {
  if (!props.task || !isLocalTask.value) {
    return;
  }

  const nextTitle = title.value.trim();
  if (!nextTitle) {
    titleError.value = "请输入任务标题";
    return;
  }

  titleError.value = "";
  emit("save", {
    taskId: props.task.id,
    updates: {
      title: nextTitle,
      description: {
        format: "plain_text",
        content: description.value.trim(),
      },
      status: status.value,
      targetFolderIds: targetFolderIds.value,
    },
  });
}

async function handleDelete(): Promise<void> {
  if (!props.task || !isLocalTask.value) {
    return;
  }

  const confirmed = await confirmDialog({
    title: "删除任务？",
    description: `任务「${props.task.title}」将被永久删除，且不可恢复。`,
    confirmLabel: "删除任务",
    confirmColor: "error",
  });

  if (!confirmed) {
    return;
  }

  emit("delete", props.task);
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetState();
    }
  }
);

watch(
  () => props.task,
  (task, previousTask) => {
    const changed =
      task?.id !== previousTask?.id ||
      task?.updatedAt?.getTime?.() !== previousTask?.updatedAt?.getTime?.();

    if (changed) {
      resetState();
    }
  }
);
</script>

<template>
  <UModal
    :open="open"
    :title="modalTitle"
    :description="modalDescription"
    @update:open="$event ? emit('update:open', $event) : close()"
  >
    <template #body>
      <div v-if="task" class="space-y-4">
        <template v-if="mode === 'view'">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <UBadge color="neutral" variant="soft">
                {{ sourceDisplay }}
              </UBadge>
              <UBadge :color="task.status === 'open' ? 'success' : 'neutral'" variant="soft">
                {{ task.status === "open" ? "打开" : "关闭" }}
              </UBadge>
              <span>创建于 {{ timeAgo(task.createdAt) }}</span>
            </div>

            <div v-if="task.labels.length" class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="label in task.labels"
                :key="label.id"
                color="neutral"
                variant="outline"
                size="xs"
              >
                {{ label.name }}
              </UBadge>
            </div>

            <div class="space-y-1.5" data-test="task-target-summary">
              <p class="text-xs font-medium text-muted">目标 Project</p>
              <div class="flex flex-wrap gap-1.5">
                <UBadge
                  v-for="folderName in currentTargetFolders"
                  :key="folderName"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ folderName }}
                </UBadge>
                <UBadge
                  v-if="staleTargetFolderIds.length > 0"
                  color="warning"
                  variant="soft"
                  size="sm"
                >
                  {{ staleTargetFolderIds.length }} 个目标 Project 已失效
                </UBadge>
                <span
                  v-if="currentTargetFolders.length === 0 && staleTargetFolderIds.length === 0"
                  class="text-xs text-muted"
                >
                  未指定目标 Project
                </span>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-default bg-muted/30 px-4 py-3">
            <div
              v-if="detailLoading"
              class="flex items-center gap-2 text-sm text-muted"
              data-test="detail-loading"
            >
              <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
              <span>正在加载详情</span>
            </div>
            <p v-else-if="detailError" class="text-sm italic text-muted" data-test="detail-error">
              详情加载失败
            </p>
            <UEditor
              v-else-if="editorContent"
              data-test="task-description-editor"
              :data-content-type="editorContentType"
              :model-value="editorContent"
              :editable="false"
              :content-type="editorContentType"
            />
            <p v-else class="text-sm italic text-muted">暂无描述</p>
          </div>
        </template>

        <template v-else>
          <div class="space-y-4">
            <UFormField label="标题" required :error="titleError || undefined">
              <UInput v-model="title" class="w-full" placeholder="例如：修复登录失败问题" />
            </UFormField>

            <UFormField label="描述" :error="error || undefined">
              <UTextarea
                v-model="description"
                :rows="4"
                class="w-full"
                placeholder="补充任务背景、约束或验收标准"
              />
            </UFormField>

            <UFormField label="状态">
              <URadioGroup
                v-model="status"
                :items="statusItems"
                value-key="value"
                orientation="horizontal"
                color="primary"
              />
            </UFormField>

            <fieldset class="space-y-2">
              <legend class="text-sm font-medium text-highlighted">目标 Project（可选）</legend>
              <label
                v-for="option in targetOptions"
                :key="option.id"
                class="flex items-center justify-between gap-2 rounded-md border border-default px-3 py-2 text-sm"
              >
                <span class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    :checked="targetFolderIds.includes(option.id)"
                    :aria-label="`选择目标 Project ${option.label}`"
                    @change="toggleTarget(option.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ option.label }}</span>
                </span>
                <UBadge v-if="option.stale" color="warning" variant="soft" size="sm">
                  已失效
                </UBadge>
              </label>
            </fieldset>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <template v-if="mode === 'view'">
        <UButton variant="ghost" color="neutral" @click="close">关闭</UButton>
        <UButton v-if="canEdit" color="primary" @click="startEditing">编辑</UButton>
      </template>

      <template v-else>
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            v-if="isLocalTask"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            data-test="delete-task-button"
            @click="void handleDelete()"
          >
            删除任务
          </UButton>

          <div class="flex items-center gap-3">
            <UButton variant="ghost" color="neutral" @click="cancelEditing">取消</UButton>
            <UButton color="primary" :disabled="!canSave" @click="submit">保存</UButton>
          </div>
        </div>
      </template>
    </template>
  </UModal>
</template>
