<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CreateLocalTaskInput } from "@shared/types/task";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  create: [input: CreateLocalTaskInput];
}>();

const title = ref("");
const description = ref("");
const titleError = ref("");

const canSubmit = computed(() => Boolean(title.value.trim()));

watch(
  () => props.open,
  (open) => {
    if (open) {
      titleError.value = "";
      return;
    }

    title.value = "";
    description.value = "";
    titleError.value = "";
  }
);

function close(): void {
  emit("update:open", false);
}

function submit(): void {
  const nextTitle = title.value.trim();
  if (!nextTitle) {
    titleError.value = "请输入任务标题";
    return;
  }

  emit("create", {
    title: nextTitle,
    description: {
      format: "plain_text",
      content: description.value.trim(),
    },
  });
}
</script>

<template>
  <UModal
    :open="open"
    title="新建任务"
    description="创建一个本地任务，稍后可以直接发起讨论。"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="标题" required :error="titleError || undefined">
          <UInput v-model="title" class="w-full" placeholder="例如：修复登录失败问题" />
        </UFormField>

        <UFormField label="描述">
          <UTextarea
            v-model="description"
            :rows="4"
            class="w-full"
            placeholder="补充任务背景、约束或验收标准"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton variant="ghost" color="neutral" @click="close">取消</UButton>
      <UButton color="primary" :disabled="!canSubmit" @click="submit">创建任务</UButton>
    </template>
  </UModal>
</template>
