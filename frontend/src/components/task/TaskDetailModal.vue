<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { buildSourceDisplay } from "@renderer/utils/task";
import { timeAgo } from "@renderer/utils/time";
import type { TaskItem, UpdateTaskInput } from "@shared/types/task";

const props = defineProps<{
  open: boolean;
  task: TaskItem | null;
  error?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [{ taskId: string; updates: UpdateTaskInput }];
}>();

const mode = ref<"view" | "edit">("view");
const title = ref("");
const description = ref("");
const titleError = ref("");

const isLocalTask = computed(() => props.task?.source === "local");
const canEdit = computed(() => Boolean(props.task && isLocalTask.value));
const canSave = computed(() => Boolean(title.value.trim()));
const sourceDisplay = computed(() => (props.task ? buildSourceDisplay(props.task) : ""));

function resetForm(): void {
  title.value = "";
  description.value = "";
  titleError.value = "";
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
  description.value = props.task.description;
  titleError.value = "";
  mode.value = "edit";
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
      description: description.value.trim(),
    },
  });
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
    :title="mode === 'edit' ? '编辑任务' : '任务详情'"
    @update:open="$event ? emit('update:open', $event) : close()"
  >
    <template #body>
      <div v-if="task" class="space-y-5">
        <template v-if="mode === 'view'">
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-3">
              <h2 class="text-xl font-semibold leading-7 text-highlighted">
                {{ task.title }}
              </h2>
              <span class="shrink-0 text-xs text-muted">
                {{ timeAgo(task.createdAt) }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <UBadge color="neutral" variant="soft">
                {{ sourceDisplay }}
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
          </div>

          <div class="rounded-lg border border-default bg-muted/30 px-4 py-3">
            <p v-if="task.description" class="whitespace-pre-wrap text-sm leading-6 text-toned">
              {{ task.description }}
            </p>
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
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <template v-if="mode === 'view'">
          <UButton variant="ghost" color="neutral" @click="close">关闭</UButton>
          <UButton v-if="canEdit" color="primary" @click="startEditing">编辑</UButton>
        </template>

        <template v-else>
          <UButton variant="ghost" color="neutral" @click="cancelEditing">取消</UButton>
          <UButton color="primary" :disabled="!canSave" @click="submit">保存</UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>
