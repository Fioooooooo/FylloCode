<script setup lang="ts">
import { computed } from "vue";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";

interface DropdownChild {
  label: string;
  description?: string;
  active?: boolean;
  onSelect: () => void;
}

interface DropdownGroup {
  label: string;
  type: "label";
}

type DropdownEntry = DropdownChild | DropdownGroup;

const props = defineProps<{
  option: AcpSessionConfigOption;
  isPending: boolean;
}>();

const emit = defineEmits<{
  change: [value: string | boolean];
}>();

const KNOWN_ICONS: Record<string, string> = {
  mode: "i-lucide-shield-check",
  model: "i-lucide-cpu",
  thought_level: "i-lucide-brain",
};

const icon = computed(() => {
  const category = props.option.category ?? "";
  return KNOWN_ICONS[category] ?? "i-lucide-sliders";
});

function isGroup(
  candidate: AcpSessionConfigOptionValueItem | AcpSessionConfigOptionGroup
): candidate is AcpSessionConfigOptionGroup {
  return "group" in candidate;
}

const isGrouped = computed<boolean>(() => {
  if (props.option.type !== "select") return false;
  const options = props.option.options;
  return options.length > 0 && isGroup(options[0]);
});

const flatItems = computed<AcpSessionConfigOptionValueItem[]>(() => {
  if (props.option.type !== "select") return [];
  if (isGrouped.value) {
    return (props.option.options as AcpSessionConfigOptionGroup[]).flatMap(
      (group) => group.options
    );
  }
  return props.option.options as AcpSessionConfigOptionValueItem[];
});

const currentLabel = computed(() => {
  if (props.option.type !== "select") return "";
  const matched = flatItems.value.find((item) => item.value === props.option.currentValue);
  return matched?.name ?? props.option.currentValue;
});

const dropdownItems = computed<DropdownEntry[]>(() => {
  if (props.option.type !== "select") return [];

  if (isGrouped.value) {
    return (props.option.options as AcpSessionConfigOptionGroup[]).flatMap<DropdownEntry>(
      (group) => [
        { label: group.name, type: "label" as const },
        ...group.options.map<DropdownChild>((item) => ({
          label: item.name,
          description: item.description,
          active: item.value === props.option.currentValue,
          onSelect: () => emit("change", item.value),
        })),
      ]
    );
  }

  return flatItems.value.map<DropdownChild>((item) => ({
    label: item.name,
    description: item.description,
    active: item.value === props.option.currentValue,
    onSelect: () => emit("change", item.value),
  }));
});

function toggleBoolean(value: boolean): void {
  emit("change", value);
}

const tooltipUi = { content: "h-auto items-stretch gap-0 px-3 py-2 max-w-xs" } as const;
const dropdownUi = {
  content: "max-w-xs max-h-[min(20rem,calc(100vh-8rem))] overflow-y-auto",
} as const;
</script>

<template>
  <UDropdownMenu
    v-if="option.type === 'select'"
    :items="dropdownItems"
    size="md"
    :content="{ align: 'start', side: 'top', sideOffset: 8 }"
    :ui="dropdownUi"
  >
    <UTooltip :delay-duration="200" :ignore-non-keyboard-focus="true" :ui="tooltipUi">
      <template #content>
        <div class="flex flex-col gap-0.5 text-xs leading-5">
          <span class="font-medium text-highlighted">{{ option.name }}</span>
          <span v-if="option.description" class="text-muted whitespace-normal break-words">
            {{ option.description }}
          </span>
        </div>
      </template>
      <UButton
        :icon="isPending ? 'i-lucide-loader-2 animate-spin' : icon"
        variant="ghost"
        color="neutral"
        size="sm"
        :disabled="isPending"
        :aria-label="option.name"
        :data-test="`config-option-item-${option.id}`"
      >
        <span class="text-xs">{{ currentLabel }}</span>
      </UButton>
    </UTooltip>
  </UDropdownMenu>

  <UTooltip v-else :delay-duration="200" :ignore-non-keyboard-focus="true" :ui="tooltipUi">
    <template #content>
      <div class="flex flex-col gap-0.5 text-xs leading-5">
        <span class="font-medium text-highlighted">{{ option.name }}</span>
        <span v-if="option.description" class="text-muted whitespace-normal break-words">
          {{ option.description }}
        </span>
      </div>
    </template>
    <USwitch
      :model-value="option.currentValue"
      :disabled="isPending"
      :aria-label="option.name"
      :data-test="`config-option-item-${option.id}`"
      @update:model-value="toggleBoolean"
    />
  </UTooltip>
</template>
