<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@renderer/stores/session";
import type { TaskSource } from "@shared/types/task";

const sessionStore = useSessionStore();
const { activeSession, taskInfoBySessionId } = storeToRefs(sessionStore);

const taskInfo = computed(() => {
  const session = activeSession.value;
  if (!session?.originTaskRef) {
    return null;
  }

  return taskInfoBySessionId.value.get(session.id) ?? null;
});

const SOURCE_META: Record<TaskSource, { label: string; icon: string }> = {
  local: { label: "本地", icon: "i-lucide-folder" },
  yunxiao: { label: "云效", icon: "i-lucide-cloud" },
  github: { label: "GitHub", icon: "i-lucide-github" },
};

const sourceMeta = computed(() => {
  if (!taskInfo.value) return null;
  return SOURCE_META[taskInfo.value.source];
});
</script>

<template>
  <div
    v-if="taskInfo && sourceMeta"
    data-test="origin-task-banner"
    class="inline-flex max-w-full items-center gap-2.5 rounded-lg bg-primary/15 py-1.5 px-3 backdrop-blur shadow-lg shadow-primary/10"
  >
    <span class="shrink-0 text-xs text-muted">当前讨论</span>

    <span class="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
      <UIcon :name="sourceMeta.icon" class="h-3.5 w-3.5" />
      {{ sourceMeta.label }}
    </span>

    <span class="min-w-0 truncate text-sm font-medium text-highlighted">
      {{ taskInfo.title }}
    </span>
  </div>
</template>
