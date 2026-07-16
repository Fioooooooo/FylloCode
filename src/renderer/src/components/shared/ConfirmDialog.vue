<script setup lang="ts">
import { computed } from "vue";

export type ConfirmDialogColor =
  | "neutral"
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error";

interface ConfirmDialogProps {
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmColor?: ConfirmDialogColor;
}

const props = withDefaults(defineProps<ConfirmDialogProps>(), {
  description: undefined,
  cancelLabel: "取消",
  confirmLabel: "确认",
  confirmColor: "neutral",
});

const emit = defineEmits<{
  close: [value: boolean];
}>();

const iconTone = computed(() => {
  if (props.confirmColor === "error") {
    return {
      wrapperClass: "bg-error/10",
      iconClass: "text-error",
    };
  }

  return {
    wrapperClass: "bg-warning/10",
    iconClass: "text-warning",
  };
});
</script>

<template>
  <UModal :dismissible="false">
    <template #content>
      <div
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-4"
        data-test="confirm-dialog-scroll-area"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="iconTone.wrapperClass"
          >
            <UIcon name="i-lucide-triangle-alert" class="h-5 w-5" :class="iconTone.iconClass" />
          </div>

          <div class="min-w-0 flex-1 space-y-1">
            <h2 class="text-base font-semibold text-highlighted">
              {{ title }}
            </h2>
            <p
              v-if="description"
              class="break-words whitespace-pre-wrap text-sm leading-relaxed text-muted"
            >
              {{ description }}
            </p>
          </div>
        </div>
      </div>

      <div class="flex shrink-0 justify-end gap-2 px-6 py-4" data-test="confirm-dialog-actions">
        <UButton variant="ghost" color="neutral" @click="emit('close', false)">
          {{ cancelLabel }}
        </UButton>
        <UButton :color="confirmColor" @click="emit('close', true)">
          {{ confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
