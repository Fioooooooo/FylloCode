<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { DropdownMenuItem } from "@nuxt/ui";
import { useChatStore, useSessionStore } from "@renderer/stores";
import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
  AcpSessionConfigSelect,
} from "@shared/types/acp-config";

type ConfigDropdownItem = DropdownMenuItem & {
  tooltipDescription?: string;
  children?: ConfigDropdownItem[];
};

const VALUE_DESCRIPTION_SLOT = "config-value";

const KNOWN_ICONS: Record<string, string> = {
  model: "i-lucide-cpu",
  thought_level: "i-lucide-brain",
};

const sessionStore = useSessionStore();
const chatStore = useChatStore();
const { activeDraftProbe, activeSession, draftAgentId } = storeToRefs(sessionStore);
const { pendingConfigIds } = storeToRefs(chatStore);

const sourceOptions = computed<AcpSessionConfigOption[]>(() => {
  if (activeSession.value) {
    return activeSession.value.configOptions ?? [];
  }
  return activeDraftProbe.value?.status === "ready" ? activeDraftProbe.value.configOptions : [];
});

const visibleOptions = computed<AcpSessionConfigOption[]>(() => {
  return sourceOptions.value.filter((option) => option.category !== "mode");
});

function isGroup(
  candidate: AcpSessionConfigOptionValueItem | AcpSessionConfigOptionGroup
): candidate is AcpSessionConfigOptionGroup {
  return "group" in candidate;
}

function getValueItems(option: AcpSessionConfigSelect): AcpSessionConfigOptionValueItem[] {
  return option.options.flatMap((candidate) =>
    isGroup(candidate) ? candidate.options : [candidate]
  );
}

function getCurrentValueName(option: AcpSessionConfigSelect): string {
  return (
    getValueItems(option).find((item) => item.value === option.currentValue)?.name ??
    option.currentValue
  );
}

function getIcon(option: AcpSessionConfigOption): string {
  return KNOWN_ICONS[option.category ?? ""] ?? "i-lucide-sliders";
}

const triggerSummary = computed(() => {
  const model = visibleOptions.value.find(
    (option): option is AcpSessionConfigSelect =>
      option.type === "select" && option.category === "model"
  );
  const thoughtLevel = visibleOptions.value.find(
    (option): option is AcpSessionConfigSelect =>
      option.type === "select" && option.category === "thought_level"
  );
  const values = [model, thoughtLevel]
    .filter((option): option is AcpSessionConfigSelect => option !== undefined)
    .map(getCurrentValueName);
  return values.length > 0 ? values.join(" · ") : "Config";
});

async function handleChange(
  option: AcpSessionConfigOption,
  value: string | boolean
): Promise<void> {
  const session = activeSession.value;
  try {
    if (!session) {
      if (!draftAgentId.value) return;
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
    // The stores own error toasts and rollback to the last complete snapshot.
  }
}

function buildSelectChildren(option: AcpSessionConfigSelect): ConfigDropdownItem[] {
  return option.options.flatMap<ConfigDropdownItem>((candidate) => {
    if (isGroup(candidate)) {
      return [
        { label: candidate.name, type: "label" },
        ...candidate.options.map<ConfigDropdownItem>((item) => ({
          label: item.name,
          description: item.description,
          slot: item.description ? VALUE_DESCRIPTION_SLOT : undefined,
          active: item.value === option.currentValue,
          onSelect: () => {
            void handleChange(option, item.value);
          },
        })),
      ];
    }

    return [
      {
        label: candidate.name,
        description: candidate.description,
        slot: candidate.description ? VALUE_DESCRIPTION_SLOT : undefined,
        active: candidate.value === option.currentValue,
        onSelect: () => {
          void handleChange(option, candidate.value);
        },
      },
    ];
  });
}

const menuItems = computed<ConfigDropdownItem[]>(() => {
  return visibleOptions.value.map<ConfigDropdownItem>((option) => {
    const isPending = pendingConfigIds.value.has(option.id);
    if (option.type === "boolean") {
      return {
        type: "checkbox",
        label: option.name,
        description: option.description,
        icon: getIcon(option),
        checked: option.currentValue,
        disabled: isPending,
        loading: isPending,
        onUpdateChecked: (checked: boolean) => {
          void handleChange(option, checked);
        },
      };
    }

    return {
      label: option.name,
      description: getCurrentValueName(option),
      tooltipDescription: option.description,
      icon: getIcon(option),
      disabled: isPending,
      loading: isPending,
      children: buildSelectChildren(option),
    };
  });
});

function getTooltipDescription(item: DropdownMenuItem): string | undefined {
  return (item as ConfigDropdownItem).tooltipDescription;
}

function getItemDescription(item: DropdownMenuItem): string {
  return item.description ?? "";
}

const tooltipUi = { content: "h-auto items-stretch gap-0 px-3 py-2 max-w-xs" } as const;
const dropdownUi = {
  content: "max-w-xs max-h-[min(20rem,calc(100vh-8rem))] overflow-y-auto",
} as const;
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
    <UDropdownMenu
      v-if="menuItems.length > 0"
      :items="menuItems"
      size="md"
      :content="{ align: 'start', side: 'top', sideOffset: 8 }"
      :ui="dropdownUi"
    >
      <template #item-label="{ item }">
        <UTooltip
          v-if="getTooltipDescription(item)"
          :delay-duration="200"
          :content="{ side: 'right', sideOffset: 18 }"
          :ui="tooltipUi"
        >
          <template #content>
            {{ getTooltipDescription(item) }}
          </template>
          <span class="block w-full truncate">{{ item.label }}</span>
        </UTooltip>
        <span v-else class="block w-full truncate">{{ item.label }}</span>
      </template>

      <template #config-value-description="{ item }">
        <UTooltip
          :delay-duration="200"
          :content="{ side: 'right', sideOffset: 18 }"
          :ui="tooltipUi"
        >
          <template #content>
            <span class="block whitespace-normal break-words">{{ getItemDescription(item) }}</span>
          </template>
          <span class="block truncate">{{ getItemDescription(item) }}</span>
        </UTooltip>
      </template>

      <UTooltip :delay-duration="200" :ignore-non-keyboard-focus="true" :ui="tooltipUi">
        <template #content>
          {{ triggerSummary }}
        </template>
        <UButton
          icon="i-lucide-sliders-horizontal"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-label="`Config: ${triggerSummary}`"
          data-test="config-options-trigger"
        >
          <span class="text-xs">{{ triggerSummary }}</span>
        </UButton>
      </UTooltip>
    </UDropdownMenu>
  </Transition>
</template>
