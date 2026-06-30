<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { FylloActionDefinition } from "@renderer/config/fyllo-actions";
import type {
  FylloActionHandlerResult,
  FylloActionParseResult,
  FylloActionPayload,
  FylloActionState,
  FylloActionStateStatus,
} from "@shared/types/fyllo-action";

type ExecutionStatus = "ready" | "running" | "succeeded" | "failed" | "cancelled";
type DisplayStatus = FylloActionParseResult["status"] | Exclude<ExecutionStatus, "ready">;
type StatusColor = "error" | "success" | "primary" | "neutral";

const props = defineProps<{
  parseResult: FylloActionParseResult;
  definition: FylloActionDefinition | null;
  confirmHandler: () => Promise<FylloActionHandlerResult>;
  actionId?: string | null;
  persistedState?: FylloActionState;
  persistActionState?: (state: FylloActionState) => Promise<void>;
  isDark?: boolean;
  customId?: string;
  indexKey?: number | string;
}>();

defineSlots<{
  default?: (props: { payload: FylloActionPayload; status: DisplayStatus }) => unknown;
}>();

const executionStatus = ref<ExecutionStatus>("ready");
const executionError = ref<string | null>(null);
const statePersistenceError = ref<string | null>(null);

const parseSignature = computed(() => {
  const result = props.parseResult;
  if (result.status === "ready") {
    return `${result.status}:${result.type}:${JSON.stringify(result.payload)}`;
  }

  if (result.status === "invalid") {
    return `${result.status}:${result.type ?? ""}:${result.error.code}:${result.error.message}:${(result.error.details ?? []).join("|")}`;
  }

  return `${result.status}:${result.type ?? ""}`;
});

const persistedStateSignature = computed(() =>
  props.persistedState
    ? `${props.persistedState.type}:${props.persistedState.status}:${props.persistedState.updatedAt}`
    : ""
);

function getInitialExecutionStatus(): ExecutionStatus {
  if (
    props.parseResult.status === "ready" &&
    props.persistedState?.type === props.parseResult.type
  ) {
    return props.persistedState.status;
  }

  return "ready";
}

watch(
  [parseSignature, persistedStateSignature],
  () => {
    executionStatus.value = getInitialExecutionStatus();
    executionError.value = null;
    statePersistenceError.value = null;
  },
  { immediate: true }
);

const displayStatus = computed<DisplayStatus>(() => {
  if (executionStatus.value === "cancelled") {
    return "cancelled";
  }

  if (props.parseResult.status !== "ready") {
    return props.parseResult.status;
  }

  return executionStatus.value;
});

const readyPayload = computed<FylloActionPayload | null>(() =>
  props.parseResult.status === "ready" ? props.parseResult.payload : null
);

const canConfirm = computed(
  () =>
    props.parseResult.status === "ready" &&
    (executionStatus.value === "ready" || executionStatus.value === "failed")
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

async function persistExecutionStatus(status: FylloActionStateStatus): Promise<void> {
  if (props.parseResult.status !== "ready" || !props.actionId || !props.persistActionState) {
    return;
  }

  try {
    await props.persistActionState({
      type: props.parseResult.type,
      status,
      updatedAt: new Date().toISOString(),
    });
    statePersistenceError.value = null;
  } catch (error) {
    statePersistenceError.value = error instanceof Error ? error.message : String(error);
  }
}

async function handleConfirm(): Promise<void> {
  if (!canConfirm.value) {
    return;
  }

  executionStatus.value = "running";
  executionError.value = null;

  try {
    const result = await props.confirmHandler();

    if (result.outcome === "succeeded") {
      executionStatus.value = "succeeded";
      await persistExecutionStatus("succeeded");
      return;
    }

    if (result.outcome === "cancelled") {
      executionStatus.value = "cancelled";
      await persistExecutionStatus("cancelled");
      return;
    }

    if (result.outcome === "dismissed") {
      executionStatus.value = "ready";
      return;
    }

    executionStatus.value = "failed";
    executionError.value = result.error;
    await persistExecutionStatus("failed");
  } catch (error) {
    executionStatus.value = "failed";
    executionError.value = error instanceof Error ? error.message : String(error);
    await persistExecutionStatus("failed");
  }
}

async function handleCancel(): Promise<void> {
  if (!canCancel.value) {
    return;
  }

  executionStatus.value = "cancelled";
  executionError.value = null;
  await persistExecutionStatus("cancelled");
}
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

        <p v-if="statePersistenceError" class="text-xs leading-5 text-warning">
          状态保存失败：{{ statePersistenceError }}
        </p>

        <div v-if="showActions" class="flex flex-wrap items-center gap-2">
          <UButton
            color="primary"
            size="xs"
            :loading="displayStatus === 'running'"
            :disabled="!canConfirm"
            @click="void handleConfirm()"
          >
            {{ confirmLabel }}
          </UButton>
          <UButton
            v-if="showCancel"
            color="neutral"
            variant="outline"
            size="xs"
            :disabled="!canCancel"
            @click="void handleCancel()"
          >
            取消
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
