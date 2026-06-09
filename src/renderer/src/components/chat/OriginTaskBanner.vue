<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@renderer/stores/session";

const sessionStore = useSessionStore();
const { activeSession, taskInfoBySessionId } = storeToRefs(sessionStore);

const taskInfo = computed(() => {
  const session = activeSession.value;
  if (!session?.originTaskRef) {
    return null;
  }

  return taskInfoBySessionId.value.get(session.id) ?? null;
});
</script>

<template>
  <div v-if="taskInfo" data-test="origin-task-banner" class="sticky top-0 z-10 px-2 pb-2">
    <div
      class="flex min-h-10 items-center gap-2 rounded-md border border-default bg-default/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <UBadge color="neutral" variant="subtle" size="sm">
        {{ taskInfo.source }}
      </UBadge>
      <span class="min-w-0 truncate text-sm font-medium text-highlighted">
        {{ taskInfo.title }}
      </span>
    </div>
  </div>
</template>
