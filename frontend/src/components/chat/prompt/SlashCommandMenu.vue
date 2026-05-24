<script setup lang="ts">
import { computed } from "vue";
import type { AcpAvailableCommand } from "@shared/types/chat";

type CommandMenuItem = {
  id: string;
  label: string;
  description: string;
  command: AcpAvailableCommand;
};

const props = defineProps<{
  commands: AcpAvailableCommand[];
  open: boolean;
  searchTerm: string;
}>();

const emit = defineEmits<{
  "button-trigger": [];
  select: [command: AcpAvailableCommand];
  "update:open": [value: boolean];
  "update:searchTerm": [value: string];
}>();

const hasAvailableCommands = computed(() => props.commands.length > 0);
const commandMenuGroups = computed(() => [
  {
    id: "available-commands",
    items: props.commands.map<CommandMenuItem>((command) => ({
      id: command.name,
      label: `/${command.name}`,
      description: command.description,
      command,
    })),
  },
]);

function isCommandMenuItem(item: unknown): item is CommandMenuItem {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  return "command" in item;
}

function handleCommandSelect(item: unknown): void {
  if (!isCommandMenuItem(item)) {
    return;
  }

  emit("select", item.command);
}
</script>

<template>
  <UPopover
    :open="props.open"
    :portal="false"
    :content="{ align: 'start', side: 'top' }"
    :ui="{
      content: 'w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #default>
      <UButton
        v-if="hasAvailableCommands"
        data-test="slash-button"
        variant="ghost"
        size="sm"
        color="neutral"
        icon="i-lucide-command"
        @click="emit('button-trigger')"
      />
    </template>

    <template #content>
      <UCommandPalette
        v-if="props.open"
        :search-term="props.searchTerm"
        data-test="slash-menu"
        class="max-h-[min(24rem,calc(100vh-8rem))] overflow-hidden"
        :groups="commandMenuGroups"
        :autofocus="true"
        placeholder="Search commands"
        :ui="{
          root: 'w-full max-w-full',
          content: 'max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto',
        }"
        @update:search-term="emit('update:searchTerm', $event)"
        @update:model-value="handleCommandSelect"
        @update:open="emit('update:open', $event)"
      />
    </template>
  </UPopover>
</template>
