<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import type {
  ProposalSpecDeltaItem,
  ProposalSpecDeltaOverview,
  ProposalSpecDeltaType,
} from "@shared/types/proposal";

const props = defineProps<{
  overview: ProposalSpecDeltaOverview | null;
  loading: boolean;
  error: string | null;
}>();

const isDark = useDark();
const openIds = ref<Set<string>>(new Set());

const deltaOrder: ProposalSpecDeltaType[] = ["ADDED", "MODIFIED", "REMOVED", "RENAMED"];

const deltaConfig: Record<
  ProposalSpecDeltaType,
  {
    label: string;
    color: "success" | "info" | "error" | "warning";
    railClass: string;
  }
> = {
  ADDED: { label: "新增", color: "success", railClass: "bg-success" },
  MODIFIED: { label: "修改", color: "info", railClass: "bg-info" },
  REMOVED: { label: "移除", color: "error", railClass: "bg-error" },
  RENAMED: {
    label: "重命名",
    color: "warning",
    railClass: "bg-warning",
  },
};

const items = computed(() => props.overview?.items ?? []);

const totals = computed(() => ({
  capabilities: items.value.length,
  requirements: items.value.reduce((sum, item) => sum + item.requirementsCount, 0),
  scenarios: items.value.reduce((sum, item) => sum + item.scenariosCount, 0),
}));

const hasItems = computed(() => items.value.length > 0);

function sortedDeltaTypes(types: ProposalSpecDeltaType[]): ProposalSpecDeltaType[] {
  return deltaOrder.filter((type) => types.includes(type));
}

function isOpen(id: string): boolean {
  return openIds.value.has(id);
}

function toggleOpen(id: string): void {
  const next = new Set(openIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  openIds.value = next;
}

function resetOpenItems(): void {
  openIds.value = new Set();
}

function markdownId(specId: string, requirementIndex: number, scenarioIndex?: number): string {
  const base = `proposal-spec-${specId}-requirement-${requirementIndex}`;
  return scenarioIndex === undefined ? base : `${base}-scenario-${scenarioIndex}`;
}

function safeDeltaConfig(type: ProposalSpecDeltaType) {
  return deltaConfig[type];
}

function formatCount(value: number, unit: string): string {
  return `${value} ${unit}`;
}

function formatOverviewCounts(): string {
  return [
    formatCount(totals.value.capabilities, "个能力规约"),
    formatCount(totals.value.requirements, "条需求"),
    formatCount(totals.value.scenarios, "个场景"),
  ].join(" · ");
}

function formatCapabilityCounts(spec: ProposalSpecDeltaItem): string {
  return [
    formatCount(spec.requirementsCount, "条需求"),
    formatCount(spec.scenariosCount, "个场景"),
  ].join(" · ");
}

watch(
  () => items.value.map((item) => item.id).join("\n"),
  () => {
    resetOpenItems();
  },
  { immediate: true }
);

watch(items, (specs) => {
  const availableIds = new Set(specs.map((item) => item.id));
  const retained = [...openIds.value].filter((id) => availableIds.has(id));
  if (retained.length !== openIds.value.size) {
    openIds.value = new Set(retained);
  }
});
</script>

<template>
  <div class="space-y-7" data-test="proposal-specs-delta">
    <div v-if="loading" class="space-y-5">
      <section class="flex items-center justify-between border-b border-default/50 pb-2">
        <USkeleton class="h-4 w-32 rounded" />
        <USkeleton class="h-4 w-56 rounded" />
      </section>

      <section class="space-y-4">
        <div v-for="item in 4" :key="item" class="border-b border-default/50 py-4">
          <USkeleton class="h-6 w-2/3 rounded" />
          <USkeleton v-if="item === 1" class="mt-5 h-28 w-full rounded-lg" />
        </div>
      </section>
    </div>

    <div v-else-if="error">
      <UAlert
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="Specs 变更加载失败"
        :description="error"
        data-test="proposal-specs-delta-error"
      />
    </div>

    <AppEmptyState
      v-else-if="!hasItems"
      icon="i-lucide-scroll-text"
      title="本次提案未修改任何能力规约"
      description="当提案涉及规约变更时，这里会按能力规约展示新增、修改、移除与重命名的变更。"
      data-test="proposal-specs-delta-empty"
    />

    <template v-else>
      <section
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default/50 pb-2 px-2"
        data-test="proposal-specs-overview-strip"
      >
        <p class="text-sm font-medium text-muted">本次变更范围</p>
        <p class="text-sm font-medium text-muted">
          {{ formatOverviewCounts() }}
        </p>
      </section>

      <section class="border-b border-default/50" data-test="proposal-specs-delta-reader">
        <article
          v-for="spec in items"
          :key="spec.id"
          class="border-t border-default/50 first:border-t-0"
          data-test="proposal-specs-capability"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-4 text-left transition-colors duration-150 hover:bg-elevated"
            :aria-expanded="isOpen(spec.id)"
            data-test="proposal-specs-capability-toggle"
            @click="toggleOpen(spec.id)"
          >
            <UIcon
              :name="isOpen(spec.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-4 shrink-0 text-muted"
            />
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span class="truncate text-base font-semibold text-highlighted">
                {{ spec.id }}
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge
                  v-for="deltaType in sortedDeltaTypes(spec.deltaTypes)"
                  :key="deltaType"
                  :color="safeDeltaConfig(deltaType).color"
                  variant="soft"
                  size="sm"
                  class="rounded-md px-2 py-0.5 text-xs font-semibold"
                >
                  {{ safeDeltaConfig(deltaType).label }}
                </UBadge>
              </div>
            </div>
            <span class="shrink-0 text-sm text-muted">
              {{ formatCapabilityCounts(spec) }}
            </span>
          </button>

          <div v-if="isOpen(spec.id)" class="pb-8 pl-7" data-test="proposal-specs-capability-body">
            <p v-if="spec.purpose" class="text-sm leading-relaxed text-muted">
              {{ spec.purpose }}
            </p>
            <p class="mt-1 truncate text-xs text-dimmed">
              {{ spec.sourcePath }}
            </p>

            <div class="mt-7 space-y-7">
              <section
                v-for="(requirement, requirementIndex) in spec.requirementGroups"
                :key="`${requirement.title}-${requirementIndex}`"
                class="relative pl-8"
                data-test="proposal-specs-requirement-section"
              >
                <div
                  class="absolute bottom-0 left-0 top-0 w-[3px] rounded-full"
                  :class="safeDeltaConfig(requirement.deltaType).railClass"
                  data-test="proposal-specs-requirement-rail"
                />

                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold text-muted">
                    #{{ requirementIndex + 1 }}
                  </span>
                  <UBadge
                    :color="safeDeltaConfig(requirement.deltaType).color"
                    variant="soft"
                    size="sm"
                    class="rounded-md px-2 py-0.5 text-xs font-semibold"
                  >
                    {{ safeDeltaConfig(requirement.deltaType).label }}
                  </UBadge>
                  <h3 class="min-w-0 text-base font-semibold leading-7 text-highlighted">
                    {{ requirement.title }}
                  </h3>
                </div>

                <div
                  v-if="requirement.body"
                  class="prose dark:prose-invert mt-3 max-w-none text-base leading-7 prose-p:my-3 prose-p:leading-7 prose-ul:my-3 prose-ul:pl-5 prose-li:my-1.5 prose-code:whitespace-nowrap prose-code:rounded-md prose-code:bg-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:text-default prose-strong:font-bold prose-strong:text-highlighted"
                >
                  <MarkStream
                    :id="markdownId(spec.id, requirementIndex)"
                    :content="requirement.body"
                    :is-streaming="false"
                    :is-dark="isDark"
                  />
                </div>

                <div
                  v-if="requirement.scenarios.length > 0"
                  class="mt-3 space-y-3"
                  data-test="proposal-specs-scenario-list"
                >
                  <div
                    v-for="(scenario, scenarioIndex) in requirement.scenarios"
                    :key="`${scenario.title}-${scenarioIndex}`"
                    class="rounded-lg border border-default/50 bg-elevated/50 px-4 py-3"
                    data-test="proposal-specs-scenario"
                  >
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        class="rounded-md border border-default bg-default px-2 py-0.5 text-[11px] font-medium tracking-wider text-muted"
                      >
                        场景
                      </span>
                      <h4 class="min-w-0 text-sm font-semibold text-toned">
                        {{ scenario.title }}
                      </h4>
                    </div>
                    <div
                      v-if="scenario.body"
                      class="prose prose-sm dark:prose-invert mt-2 max-w-none text-sm leading-6 text-muted prose-p:my-2 prose-p:leading-6 prose-ul:my-2 prose-ul:pl-5 prose-li:my-1 prose-code:whitespace-nowrap prose-code:rounded-md prose-code:bg-default prose-code:px-1.5 prose-code:py-0.5 prose-code:text-default prose-strong:font-bold prose-strong:text-highlighted"
                    >
                      <MarkStream
                        :id="markdownId(spec.id, requirementIndex, scenarioIndex)"
                        :content="scenario.body"
                        :is-streaming="false"
                        :is-dark="isDark"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>
