<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import ConfigOptionItem from "./ConfigOptionItem.vue";

const KNOWN_PRIORITY: Record<string, number> = {
  mode: 0,
  model: 1,
  thought_level: 2,
};

const sessionStore = useSessionStore();
const chatStore = useChatStore();
const { activeDraftProbe, activeSession, draftAgentId } = storeToRefs(sessionStore);
const { pendingConfigIds } = storeToRefs(chatStore);

const sourceOptions = computed<AcpSessionConfigOption[]>(() => {
  if (activeSession.value) {
    return activeSession.value.configOptions ?? [];
  }
  return activeDraftProbe?.value?.status === "ready" ? activeDraftProbe.value.configOptions : [];
});

const sortedOptions = computed<AcpSessionConfigOption[]>(() => {
  const options = sourceOptions.value;
  if (options.length === 0) return [];

  const indexed = options.map((option, index) => ({ option, index }));
  return indexed
    .sort((a, b) => {
      const aPriority = KNOWN_PRIORITY[a.option.category ?? ""] ?? Number.POSITIVE_INFINITY;
      const bPriority = KNOWN_PRIORITY[b.option.category ?? ""] ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.index - b.index;
    })
    .map(({ option }) => option);
});

const hasConfigOptions = computed(() => sortedOptions.value.length > 0);

async function handleChange(
  option: AcpSessionConfigOption,
  value: string | boolean
): Promise<void> {
  const session = activeSession.value;
  try {
    if (!session) {
      if (!draftAgentId?.value) return;
      await sessionStore.setDraftConfigOption({
        agentId: draftAgentId.value,
        configId: option.id,
        type: option.type,
        value,
      });
      return;
    }

    await chatStore.setConfigOption({
      sessionId: session.id,
      configId: option.id,
      type: option.type,
      value,
    });
  } catch {
    // toast already surfaced inside store; rollback handled there.
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0 translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-150 ease-out"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-1"
  >
    <div v-if="hasConfigOptions" class="inline-flex items-center gap-1 min-w-0">
      <ConfigOptionItem
        v-for="option in sortedOptions"
        :key="option.id"
        :option="option"
        :is-pending="pendingConfigIds.has(option.id)"
        @change="(value) => handleChange(option, value)"
      />
    </div>
  </Transition>
</template>
