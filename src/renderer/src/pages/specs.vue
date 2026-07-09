<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import UiSurface from "@renderer/components/shared/UiSurface.vue";
import { useProjectStore, useSpecsStore } from "@renderer/stores";

const isDark = useDark();
const projectStore = useProjectStore();
const specsStore = useSpecsStore();
const selectedId = ref<string | null>(null);
const activeRequirementIndex = ref(0);

const specs = computed(() => specsStore.data?.items ?? []);
const selectedSpec = computed(() => {
  if (specs.value.length === 0) {
    return null;
  }

  return specs.value.find((spec) => spec.id === selectedId.value) ?? specs.value[0];
});

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    selectedId.value = null;
    activeRequirementIndex.value = 0;

    if (projectId) {
      void specsStore.load(projectId);
    } else {
      specsStore.clear();
    }
  },
  { immediate: true }
);

watch(
  () => selectedSpec.value?.id ?? null,
  (id) => {
    if (id && selectedId.value !== id) {
      selectedId.value = id;
    }
    activeRequirementIndex.value = 0;
  }
);

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatScenarioCount(count: number): string {
  return `${count} 个场景`;
}

function selectSpec(id: string): void {
  selectedId.value = id;
  activeRequirementIndex.value = 0;
  void nextTick(() => {
    document.getElementById(requirementDomId(0))?.scrollIntoView({ block: "start" });
  });
}

function requirementDomId(index: number): string {
  return `spec-requirement-${selectedSpec.value?.id ?? "unknown"}-${index}`;
}

function scrollToRequirement(index: number): void {
  activeRequirementIndex.value = index;
  document.getElementById(requirementDomId(index))?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-elevated space-x-2" data-test="specs-page">
    <aside class="h-full w-65 shrink-0 overflow-hidden rounded-lg bg-default">
      <div class="flex h-full flex-col">
        <div class="border-b border-default/50 px-4 py-3">
          <PageHeader
            eyebrow="Specs"
            title="能力规约"
            description="当前项目的 OpenSpec 能力规约。"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div v-if="specsStore.loading" class="space-y-2" data-test="specs-loading-skeleton">
            <div v-for="item in 8" :key="item" class="rounded-lg bg-elevated/70 px-2.5 py-2">
              <USkeleton class="h-4 w-36 rounded" />
              <USkeleton class="mt-2 h-3 w-full rounded" />
            </div>
          </div>

          <div v-else-if="specs.length > 0" class="space-y-1" data-test="specs-list">
            <UiSurface
              v-for="spec in specs"
              :key="spec.id"
              as="button"
              variant="flat"
              interactive
              padding="none"
              class="w-full px-2.5 py-2 text-left"
              :class="
                selectedSpec?.id === spec.id
                  ? '!bg-primary/15 text-primary ring-1 ring-primary/15'
                  : 'text-default hover:bg-elevated'
              "
              data-test="specs-list-item"
              @click="selectSpec(spec.id)"
            >
              <div class="min-w-0 space-y-0.5">
                <p class="truncate text-sm font-medium text-highlighted">{{ spec.id }}</p>
                <p class="truncate text-xs leading-relaxed text-muted">
                  {{ spec.purpose || "未声明 Purpose" }}
                </p>
              </div>
            </UiSurface>
          </div>
        </div>
      </div>
    </aside>

    <section class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-default">
      <div v-if="specsStore.loading" class="flex flex-1 flex-col" data-test="specs-detail-loading">
        <header class="shrink-0 border-b border-default/50 px-6 py-4">
          <USkeleton class="h-6 w-56 rounded" />
          <USkeleton class="mt-3 h-4 w-2/3 rounded" />
          <USkeleton class="mt-3 h-3 w-80 rounded" />
        </header>
        <div class="grid flex-1 grid-cols-[16rem_1fr]">
          <div class="border-r border-default/50 p-3">
            <USkeleton v-for="item in 6" :key="item" class="mb-2 h-10 rounded" />
          </div>
          <div class="p-6">
            <USkeleton class="h-5 w-64 rounded" />
            <USkeleton class="mt-4 h-24 w-full rounded" />
            <USkeleton class="mt-6 h-40 w-full rounded" />
          </div>
        </div>
      </div>

      <div v-else-if="specsStore.error" class="flex flex-1 items-start p-6">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="能力规约加载失败"
          :description="specsStore.error"
          data-test="specs-error-alert"
        />
      </div>

      <AppEmptyState
        v-else-if="!selectedSpec"
        class="flex-1"
        icon="i-lucide-scroll-text"
        title="暂无能力规约"
        description="当前项目的 openspec/specs 目录下还没有可读取的 spec.md。"
        data-test="specs-empty-state"
      />

      <template v-else>
        <header class="shrink-0 border-b border-default/50">
          <div class="px-6 py-4">
            <div class="flex items-start justify-between gap-6">
              <div class="min-w-0 flex-1 space-y-2">
                <h2 class="truncate text-xl font-semibold text-highlighted">
                  {{ selectedSpec.id }}
                </h2>
                <p class="text-sm leading-relaxed text-muted">
                  {{ selectedSpec.purpose || "未声明 Purpose" }}
                </p>
                <div class="flex min-w-0 items-center gap-3 text-xs text-muted">
                  <span class="min-w-0 truncate">{{ selectedSpec.sourcePath }}</span>
                  <span class="shrink-0"
                    >最近更新 {{ formatUpdatedAt(selectedSpec.updatedAt) }}</span
                  >
                </div>
              </div>

              <div class="grid w-48 shrink-0 grid-cols-2 gap-2">
                <div class="rounded-lg bg-elevated/60 px-3 py-2">
                  <p class="text-[11px] text-muted">需求</p>
                  <p class="text-lg font-semibold leading-6 text-highlighted">
                    {{ selectedSpec.requirementsCount }}
                  </p>
                </div>
                <div class="rounded-lg bg-elevated/60 px-3 py-2">
                  <p class="text-[11px] text-muted">场景</p>
                  <p class="text-lg font-semibold leading-6 text-highlighted">
                    {{ selectedSpec.scenariosCount }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div class="flex min-h-0 flex-1 overflow-hidden">
          <nav class="w-64 shrink-0 overflow-y-auto border-r border-default/50 bg-default p-3">
            <div class="mb-2 flex items-center justify-between gap-2 px-2">
              <p class="text-[11px] font-medium text-muted">需求</p>
              <span class="text-[11px] text-muted">
                {{ selectedSpec.requirementGroups.length }}
              </span>
            </div>

            <div class="space-y-1" data-test="specs-requirement-index">
              <button
                v-for="(requirement, requirementIndex) in selectedSpec.requirementGroups"
                :key="`${requirement.title}-${requirementIndex}`"
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left transition-colors duration-150"
                :class="
                  activeRequirementIndex === requirementIndex
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted hover:bg-elevated hover:text-highlighted'
                "
                data-test="specs-requirement-index-item"
                @click="scrollToRequirement(requirementIndex)"
              >
                <div class="flex items-start gap-2">
                  <span class="mt-0.5 w-5 shrink-0 text-[11px] leading-4">
                    {{ requirementIndex + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium">
                      {{ requirement.title }}
                    </p>
                    <p class="text-[11px] leading-4 text-muted">
                      {{ formatScenarioCount(requirement.scenarios.length) }}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </nav>

          <div class="flex-1 overflow-y-auto">
            <div class="mx-auto max-w-3xl px-6 py-6">
              <div class="divide-y divide-default/50">
                <section
                  v-for="(requirement, requirementIndex) in selectedSpec.requirementGroups"
                  :id="requirementDomId(requirementIndex)"
                  :key="`${requirement.title}-${requirementIndex}`"
                  class="scroll-mt-4 py-6 first:pt-0"
                  data-test="specs-requirement-section"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <h3 class="text-base font-semibold text-highlighted">
                        {{ requirement.title }}
                      </h3>
                    </div>
                  </div>

                  <div
                    v-if="requirement.body"
                    class="prose prose-sm dark:prose-invert mt-3 max-w-none"
                  >
                    <MarkStream
                      :id="`spec-${selectedSpec.id}-requirement-${requirementIndex}`"
                      :content="requirement.body"
                      :is-streaming="false"
                      :is-dark="isDark"
                    />
                  </div>

                  <div class="relative mt-5 space-y-5" data-test="specs-scenario-timeline">
                    <div
                      v-if="requirement.scenarios.length > 0"
                      class="absolute bottom-2 left-[7px] top-2 w-px bg-primary/30"
                    />
                    <div
                      v-for="(scenario, scenarioIndex) in requirement.scenarios"
                      :key="`${scenario.title}-${scenarioIndex}`"
                      class="relative pl-7"
                      data-test="specs-scenario"
                    >
                      <span
                        class="absolute left-0 top-1.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-default ring-2 ring-primary/40"
                      >
                        <span class="size-1.5 rounded-full bg-primary" />
                      </span>
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] text-muted">#{{ scenarioIndex + 1 }}</span>
                        <h4 class="text-sm font-medium text-highlighted">
                          {{ scenario.title }}
                        </h4>
                      </div>
                      <div
                        v-if="scenario.body"
                        class="prose prose-sm dark:prose-invert mt-2 max-w-none"
                      >
                        <MarkStream
                          :id="`spec-${selectedSpec.id}-requirement-${requirementIndex}-scenario-${scenarioIndex}`"
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
          </div>
        </div>
      </template>
    </section>
  </div>
</template>
