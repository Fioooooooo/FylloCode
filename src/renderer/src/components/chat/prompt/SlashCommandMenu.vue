<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import type { AcpAvailableCommand } from "@shared/types/chat";

type CommandMenuItem = {
  id: string;
  label: string;
  command: AcpAvailableCommand;
};

type CommandHighlightPayload = {
  ref?: unknown;
  value?: unknown;
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

const highlightedCommand = shallowRef<AcpAvailableCommand | null>(null);
const highlightedReference = shallowRef<HTMLElement | null>(null);
const hasAvailableCommands = computed(() => props.commands.length > 0);
const commandMenuGroups = computed(() => [
  {
    id: "available-commands",
    items: props.commands.map<CommandMenuItem>((command) => ({
      id: command.name,
      label: `/${command.name}`,
      command,
    })),
  },
]);
const commandPaletteFuse = computed(() => ({
  resultLimit: props.commands.length,
  matchAllWhenSearchEmpty: true,
  fuseOptions: {
    shouldSort: false,
    keys: ["label", "command.description", "command.hint"],
  },
}));
const highlightedDescription = computed(() =>
  getCommandDetail(highlightedCommand.value?.description)
);
const highlightedUsage = computed(() => getCommandUsage(highlightedCommand.value));
const commandDetailsReference = computed(() => highlightedReference.value ?? undefined);
const shouldShowCommandDetails = computed(
  () =>
    Boolean(highlightedDescription.value || highlightedUsage.value) &&
    Boolean(highlightedReference.value)
);

function isCommandMenuItem(item: unknown): item is CommandMenuItem {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const maybeItem = item as Partial<CommandMenuItem>;
  return typeof maybeItem.label === "string" && isAcpAvailableCommand(maybeItem.command);
}

function isAcpAvailableCommand(command: unknown): command is AcpAvailableCommand {
  return (
    typeof command === "object" &&
    command !== null &&
    typeof (command as Partial<AcpAvailableCommand>).name === "string"
  );
}

function isElementReference(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
}

function getCommandDetail(value: string | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function getCommandUsage(command: AcpAvailableCommand | null): string | null {
  const hint = getCommandDetail(command?.hint);
  if (!command || !hint) {
    return null;
  }

  if (hint.startsWith("/")) {
    return hint;
  }

  return `/${command.name} ${hint}`;
}

function clearCommandHighlight(): void {
  highlightedCommand.value = null;
  highlightedReference.value = null;
}

function handleCommandHighlight(payload: CommandHighlightPayload | undefined): void {
  if (!payload || !isCommandMenuItem(payload.value) || !isElementReference(payload.ref)) {
    clearCommandHighlight();
    return;
  }

  highlightedCommand.value = payload.value.command;
  highlightedReference.value = payload.ref;
}

function handleCommandSelect(item: unknown): void {
  if (!isCommandMenuItem(item)) {
    return;
  }

  clearCommandHighlight();
  emit("select", item.command);
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      clearCommandHighlight();
    }
  }
);

watch(
  () => props.commands.length,
  (commandCount) => {
    if (commandCount === 0) {
      clearCommandHighlight();
    }
  }
);
</script>

<template>
  <UPopover
    :open="props.open"
    :portal="false"
    :content="{ align: 'start', side: 'top' }"
    :ui="{
      content: 'w-[min(13.333rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0',
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #default>
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-out"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <UButton
          v-if="hasAvailableCommands"
          data-test="slash-button"
          variant="ghost"
          size="sm"
          color="neutral"
          icon="i-lucide-square-terminal"
          @click="emit('button-trigger')"
        />
      </Transition>
    </template>

    <template #content>
      <UCommandPalette
        v-if="props.open"
        :search-term="props.searchTerm"
        data-test="slash-menu"
        class="max-h-[min(24rem,calc(100vh-8rem))] overflow-hidden"
        :groups="commandMenuGroups"
        :fuse="commandPaletteFuse"
        :preserve-group-order="true"
        :autofocus="true"
        placeholder="Search commands"
        :ui="{
          root: 'w-full max-w-full',
          content: 'max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto',
        }"
        @update:search-term="emit('update:searchTerm', $event)"
        @update:model-value="handleCommandSelect"
        @update:open="emit('update:open', $event)"
        @highlight="handleCommandHighlight"
      />
      <UTooltip
        :open="shouldShowCommandDetails"
        :reference="commandDetailsReference"
        :content="{ side: 'right', align: 'center' }"
        :ui="{
          content:
            'h-auto w-80 max-w-[min(20rem,calc(100vw-2rem))] max-h-[min(18rem,calc(100vh-4rem))] items-stretch gap-0 overflow-y-auto overscroll-contain px-3 py-2',
        }"
      >
        <template #content>
          <div
            class="flex min-w-0 max-w-full flex-col gap-1.5 whitespace-normal break-words text-highlighted text-xs"
          >
            <p v-if="highlightedDescription" class="leading-5 break-words">
              {{ highlightedDescription }}
            </p>
            <p v-if="highlightedUsage" class="leading-4 text-muted">
              <span class="font-medium">用法: </span>
              <span class="font-mono break-all">{{ highlightedUsage }}</span>
            </p>
          </div>
        </template>
      </UTooltip>
    </template>
  </UPopover>
</template>
