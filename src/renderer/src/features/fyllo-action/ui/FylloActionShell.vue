<script setup lang="ts">
import { computed } from "vue";
import type {
  FylloActionParseResult,
  FylloActionPayload,
  FylloActionState,
} from "@shared/fyllo-action/protocol";
import type { RendererActionDefinition } from "./renderer-registry";
import type { FylloActionExecutionStatus } from "../application/execution-runtime";

type DisplayStatus =
  | FylloActionParseResult["status"]
  | Exclude<FylloActionExecutionStatus, "ready">;
type StatusColor = "error" | "success" | "primary" | "neutral";

const props = defineProps<{
  parseResult: FylloActionParseResult;
  definition: RendererActionDefinition | null;
  actionId?: string | null;
  persistedState?: FylloActionState;
  registrationError?: string | null;
  executionStatus?: FylloActionExecutionStatus;
  executionError?: string | null;
  stateSyncError?: string | null;
  isRunning?: boolean;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  retrySync: [];
  retryRegistration: [];
}>();

defineSlots<{
  default?: (props: { payload: FylloActionPayload; status: DisplayStatus }) => unknown;
}>();

const effectiveExecutionStatus = computed<FylloActionExecutionStatus>(() => {
  if (props.executionStatus && props.executionStatus !== "ready") {
    return props.executionStatus;
  }

  // runtime 回到 ready 后由 Main 持久化状态接管展示，避免同步成功后又闪回待确认。
  if (
    props.parseResult.status === "ready" &&
    props.persistedState?.type === props.parseResult.type
  ) {
    return props.persistedState.status;
  }

  return "ready";
});

const displayStatus = computed<DisplayStatus>(() => {
  if (effectiveExecutionStatus.value === "cancelled") {
    return "cancelled";
  }

  if (effectiveExecutionStatus.value === "succeeded") {
    return "succeeded";
  }

  if (effectiveExecutionStatus.value === "failed") {
    return "failed";
  }

  if (effectiveExecutionStatus.value === "running") {
    return "running";
  }

  return props.parseResult.status;
});

const readyPayload = computed<FylloActionPayload | null>(() =>
  props.parseResult.status === "ready" ? props.parseResult.payload : null
);

const canConfirm = computed(
  () =>
    props.parseResult.status === "ready" &&
    (effectiveExecutionStatus.value === "ready" || effectiveExecutionStatus.value === "failed")
);

const canCancel = computed(
  () =>
    displayStatus.value !== "running" &&
    displayStatus.value !== "succeeded" &&
    displayStatus.value !== "cancelled"
);

const showActions = computed(
  () => displayStatus.value !== "succeeded" && displayStatus.value !== "cancelled"
);

const confirmLabel = computed(() => props.definition?.confirmLabel ?? "确认");
const showCancel = computed(() => props.definition?.showCancel ?? true);

const statusLabel = computed(() => {
  const labels: Record<DisplayStatus, string> = {
    pending: "生成中",
    invalid: "无效",
    ready: "待确认",
    running: "执行中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[displayStatus.value];
});

const statusColor = computed<StatusColor>(() => {
  const colors: Record<DisplayStatus, StatusColor> = {
    pending: "neutral",
    invalid: "error",
    ready: "primary",
    running: "primary",
    succeeded: "success",
    failed: "error",
    cancelled: "neutral",
  };
  return colors[displayStatus.value];
});

const statusIcon = computed(() => {
  const icons: Record<DisplayStatus, string> = {
    pending: "i-lucide-loader-circle",
    invalid: "i-lucide-triangle-alert",
    ready: props.definition?.icon ?? "i-lucide-square-check",
    running: "i-lucide-loader-circle",
    succeeded: "i-lucide-circle-check",
    failed: "i-lucide-circle-alert",
    cancelled: "i-lucide-circle-slash",
  };
  return icons[displayStatus.value];
});

const cardTitle = computed(() => props.definition?.title ?? "Fyllo 操作");

const invalidDetails = computed(() =>
  props.parseResult.status === "invalid" ? (props.parseResult.error.details ?? []) : []
);

const invalidMessage = computed(() =>
  props.parseResult.status === "invalid" ? props.parseResult.error.message : ""
);

const persistedError = computed(() => props.persistedState?.error);
</script>

<template>
  <section
    class="my-3 max-w-xl rounded-lg border border-default bg-elevated px-3 py-3 text-sm text-default"
    :data-custom-id="props.customId"
    :data-index-key="props.indexKey"
    :data-theme="props.isDark ? 'dark' : 'light'"
    :data-fyllo-action-id="props.actionId ?? undefined"
  >
    <div class="flex items-start gap-3">
      <div
        class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accented text-highlighted"
      >
        <UIcon
          :name="statusIcon"
          class="size-4"
          :class="displayStatus === 'running' || displayStatus === 'pending' ? 'animate-spin' : ''"
        />
      </div>

      <div class="min-w-0 flex-1 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <p class="min-w-0 truncate text-sm font-semibold text-highlighted">{{ cardTitle }}</p>
          <UBadge :color="statusColor" variant="soft" size="xs">{{ statusLabel }}</UBadge>
        </div>

        <div class="space-y-1">
          <slot v-if="readyPayload" :payload="readyPayload" :status="displayStatus" />

          <p v-else-if="displayStatus === 'pending'" class="text-xs leading-5 text-muted">
            正在接收操作内容
          </p>

          <template v-else-if="displayStatus === 'invalid'">
            <p class="text-xs leading-5 text-error">{{ invalidMessage }}</p>
            <p
              v-for="detail in invalidDetails"
              :key="detail"
              class="break-words text-xs leading-5 text-muted"
            >
              {{ detail }}
            </p>
          </template>
        </div>

        <p v-if="displayStatus === 'failed' && executionError" class="text-xs leading-5 text-error">
          {{ executionError }}
        </p>

        <p v-if="persistedError" class="text-xs leading-5 text-error">
          持久化错误：{{ persistedError }}
        </p>

        <p v-if="registrationError" class="text-xs leading-5 text-warning">
          待处理状态保存失败：{{ registrationError }}
          <button
            type="button"
            class="ml-1 underline hover:text-default"
            @click="emit('retryRegistration')"
          >
            重试保存
          </button>
        </p>

        <p v-if="stateSyncError" class="text-xs leading-5 text-warning">
          状态保存失败：{{ stateSyncError }}
          <button
            type="button"
            class="ml-1 underline hover:text-default"
            @click="emit('retrySync')"
          >
            重试
          </button>
        </p>

        <div v-if="showActions" class="flex flex-wrap items-center gap-2">
          <UButton
            color="primary"
            size="xs"
            :loading="isRunning"
            :disabled="!canConfirm"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </UButton>
          <UButton
            v-if="showCancel"
            color="neutral"
            variant="outline"
            size="xs"
            :disabled="!canCancel"
            @click="emit('cancel')"
          >
            取消
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
