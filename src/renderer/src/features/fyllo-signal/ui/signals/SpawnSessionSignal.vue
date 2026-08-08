<script setup lang="ts">
import type { SpawnSessionSignalPayload } from "@shared/fyllo-signal/protocol";
import type { FylloSignalHostContextInput } from "../fyllo-signal-context";
import { SpawnedSessionInlineEntry } from "@renderer/features/spawned-session-inspector";

defineProps<{
  payload: SpawnSessionSignalPayload;
  hostContext?: FylloSignalHostContextInput;
  isDark?: boolean;
}>();
</script>

<template>
  <SpawnedSessionInlineEntry
    v-if="hostContext"
    :workspace-id="hostContext.workspaceId"
    :parent-session-id="hostContext.parentSessionId"
    :session-id="payload.sessionId"
    :is-dark="isDark"
  />
  <span
    v-else
    class="my-1 inline-flex items-center gap-1.5 rounded-lg border border-default bg-elevated px-2.5 py-1.5 text-xs text-muted"
    role="status"
    data-fyllo-signal-spawn-session-unavailable
  >
    <UIcon name="i-lucide-unplug" class="size-3.5" />Session 信息不可用
  </span>
</template>
