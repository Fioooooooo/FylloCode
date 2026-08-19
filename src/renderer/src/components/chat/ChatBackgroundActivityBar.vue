<script setup lang="ts">
import { storeToRefs } from "pinia";
import { SpawnedSessionActivityEntry } from "@renderer/features/spawned-session-inspector";
import { useSessionStore } from "@renderer/stores";

const sessionStore = useSessionStore();
const { activeSession } = storeToRefs(sessionStore);
</script>

<template>
  <div v-if="activeSession" class="px-4 py-2">
    <div class="mx-auto max-w-3xl">
      <SpawnedSessionActivityEntry
        :workspace-id="activeSession.workspaceId"
        :parent-session-id="activeSession.id"
      />
    </div>
  </div>
</template>
