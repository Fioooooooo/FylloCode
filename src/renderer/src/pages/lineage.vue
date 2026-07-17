<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@nuxt/ui/composables";
import AppEmptyState from "@renderer/components/shared/AppEmptyState.vue";
import PageHeader from "@renderer/components/shared/PageHeader.vue";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";
import { useLineageStore, useProjectStore } from "@renderer/stores";
import { timeAgo } from "@renderer/utils/time";
import type {
  LineageBrowserEntry,
  LineageBrowserProposal,
  LineageBrowserStatus,
} from "@shared/types/lineage";
import type { ProposalStatus } from "@shared/types/proposal";

type LineageFilter = "all" | "active" | "completed" | "unlinked";

const projectStore = useProjectStore();
const lineageStore = useLineageStore();
const router = useRouter();
const toast = useToast();
const { openChatSession } = useOpenChatSession();
const { openProposalDetail } = useProposalDetailSlideover();

const activeFilter = ref<LineageFilter>("all");
const selectedId = ref<string | null>(null);

const filters: Array<{ value: LineageFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "推进中" },
  { value: "completed", label: "已归档" },
  { value: "unlinked", label: "待关联" },
];

const statusConfig: Record<
  LineageBrowserStatus,
  {
    label: string;
    color: "primary" | "neutral" | "success" | "warning";
    textClass: string;
    icon: string;
  }
> = {
  applying: {
    label: "实现中",
    color: "warning",
    textClass: "text-warning",
    icon: "i-lucide-loader-circle",
  },
  completed: {
    label: "已归档",
    color: "success",
    textClass: "text-success",
    icon: "i-lucide-circle-check",
  },
  planned: {
    label: "已规划",
    color: "primary",
    textClass: "text-primary",
    icon: "i-lucide-map",
  },
  discussion: {
    label: "讨论中",
    color: "neutral",
    textClass: "text-muted",
    icon: "i-lucide-message-circle",
  },
};

const proposalStatusConfig: Record<ProposalStatus, { label: string; className: string }> = {
  creating: { label: "创建中", className: "text-primary" },
  draft: { label: "草稿", className: "text-muted" },
  applying: { label: "实现中", className: "text-warning" },
  archived: { label: "已归档", className: "text-success" },
};

const entries = computed(() => lineageStore.browserData?.entries ?? []);
const filteredLineages = computed(() =>
  entries.value.filter(
    (lineage) =>
      activeFilter.value === "all" ||
      (activeFilter.value === "active" && lineage.status !== "completed") ||
      (activeFilter.value === "completed" && lineage.status === "completed") ||
      (activeFilter.value === "unlinked" && lineage.task === null)
  )
);
const selectedLineage = computed(
  () => filteredLineages.value.find((lineage) => lineage.subjectId === selectedId.value) ?? null
);

function lineageTitle(lineage: LineageBrowserEntry): string {
  return (
    lineage.task?.snapshot.title ??
    lineage.sessions[0]?.title ??
    `自由讨论 · ${lineage.subjectId.slice(-6)}`
  );
}

function lineageDescription(lineage: LineageBrowserEntry): string {
  if (lineage.task) {
    return lineage.task.snapshot.description.content || "该任务还没有补充描述。";
  }
  return "这条讨论尚未关联任务，可以继续作为项目演进记录保留。";
}

function planCount(lineage: LineageBrowserEntry): number {
  return lineage.sessions.reduce((total, session) => total + session.plans.length, 0);
}

function proposalCount(lineage: LineageBrowserEntry): number {
  return lineage.sessions.reduce((total, session) => total + session.proposals.length, 0);
}

function proposalTitle(proposal: LineageBrowserProposal): string {
  return proposal.title ?? proposal.changeId;
}

function proposalStatusLabel(status: ProposalStatus | null): string {
  return status ? proposalStatusConfig[status].label : "内容不可用";
}

function proposalStatusClass(status: ProposalStatus | null): string {
  return status ? proposalStatusConfig[status].className : "text-muted";
}

function selectLineage(id: string): void {
  selectedId.value = id;
}

function setActiveFilter(filter: LineageFilter): void {
  activeFilter.value = filter;
}

async function openTask(): Promise<void> {
  await router.push("/task");
}

async function openSession(sessionId: string): Promise<void> {
  await openChatSession(sessionId);
}

async function openProposal(proposal: LineageBrowserProposal): Promise<void> {
  if (!proposal.title || !proposal.status) {
    return;
  }
  await openProposalDetail(proposal.changeId);
}

async function copyCommitHash(commitHash: string): Promise<void> {
  try {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(commitHash);
    toast.add({ title: "Commit hash 已复制", description: commitHash, color: "success" });
  } catch {
    toast.add({
      title: "Commit hash 复制失败",
      description: "请手动选择并复制完整 hash。",
      color: "error",
    });
  }
}

watch(
  filteredLineages,
  (visibleLineages) => {
    if (!visibleLineages.some((lineage) => lineage.subjectId === selectedId.value)) {
      selectedId.value = visibleLineages[0]?.subjectId ?? null;
    }
  },
  { immediate: true }
);

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    selectedId.value = null;
    activeFilter.value = "all";
    if (projectId) {
      void lineageStore.loadBrowser(projectId);
    } else {
      lineageStore.clearBrowser();
    }
  },
  { immediate: true }
);
</script>

<template>
  <div
    v-if="lineageStore.browserLoading"
    class="flex flex-1 flex-col gap-2 overflow-hidden bg-elevated lg:flex-row"
    data-test="lineage-loading"
  >
    <section class="h-72 w-full shrink-0 rounded-lg bg-default p-4 lg:h-full lg:w-84">
      <USkeleton class="h-16 w-full rounded-lg" />
      <div class="mt-6 space-y-3">
        <USkeleton v-for="item in 4" :key="item" class="h-24 w-full rounded-lg" />
      </div>
    </section>
    <section class="min-h-0 min-w-0 flex-1 rounded-lg bg-default p-6">
      <USkeleton class="h-6 w-64 rounded" />
      <USkeleton class="mt-3 h-4 w-full max-w-xl rounded" />
      <div class="mt-8 space-y-4">
        <USkeleton v-for="item in 3" :key="item" class="h-32 w-full rounded-lg" />
      </div>
    </section>
  </div>

  <div
    v-else-if="lineageStore.browserError"
    class="flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-default p-8"
    data-test="lineage-error"
  >
    <div class="max-w-md text-center">
      <div
        class="mx-auto flex size-12 items-center justify-center rounded-xl bg-error/10 text-error"
      >
        <UIcon name="i-lucide-circle-alert" class="size-6" />
      </div>
      <h1 class="mt-4 text-base font-semibold text-highlighted">工作脉络加载失败</h1>
      <p class="mt-2 text-sm leading-6 text-muted">{{ lineageStore.browserError }}</p>
    </div>
  </div>

  <div
    v-else
    class="flex flex-1 flex-col gap-2 overflow-hidden bg-elevated lg:flex-row"
    data-test="lineage-page"
  >
    <section
      class="flex h-72 w-full shrink-0 flex-col overflow-hidden rounded-lg bg-default lg:h-full lg:w-84"
      aria-label="工作脉络列表"
    >
      <div class="shrink-0 border-b border-default/50 px-4 py-4">
        <PageHeader eyebrow="Lineage" title="工作脉络" description="追溯讨论、计划、提案与提交。" />
      </div>

      <div class="shrink-0 border-b border-default/50 p-3">
        <div class="flex flex-wrap gap-1" aria-label="工作脉络筛选">
          <UButton
            v-for="filter in filters"
            :key="filter.value"
            :color="activeFilter === filter.value ? 'primary' : 'neutral'"
            :variant="activeFilter === filter.value ? 'soft' : 'ghost'"
            size="xs"
            :data-test="`lineage-filter-${filter.value}`"
            @click="setActiveFilter(filter.value)"
          >
            {{ filter.label }}
          </UButton>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div v-if="filteredLineages.length" class="space-y-1" data-test="lineage-list">
          <button
            v-for="lineage in filteredLineages"
            :key="lineage.subjectId"
            type="button"
            :class="[
              'w-full rounded-lg px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              selectedLineage?.subjectId === lineage.subjectId
                ? 'bg-primary/10'
                : 'hover:bg-elevated',
            ]"
            data-test="lineage-list-item"
            :data-subject-id="lineage.subjectId"
            @click="selectLineage(lineage.subjectId)"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
                {{ lineageTitle(lineage) }}
              </span>
              <span class="shrink-0 text-[11px] text-muted">
                {{ timeAgo(new Date(lineage.updatedAt)) }}
              </span>
            </div>

            <div class="mt-2 flex items-center gap-2">
              <UBadge color="neutral" variant="soft" size="sm" class="font-normal">
                <span class="inline-flex items-center gap-1">
                  <UIcon
                    :name="
                      lineage.origin === 'task' ? 'i-lucide-list-checks' : 'i-lucide-message-circle'
                    "
                    class="size-3"
                  />
                  {{ lineage.origin === "task" ? "任务" : "对话" }}
                </span>
              </UBadge>
              <span class="text-xs text-muted">
                {{ lineage.sessions.length }} sessions · {{ proposalCount(lineage) }} proposals
              </span>
            </div>

            <div class="mt-2.5 flex items-center justify-between gap-2">
              <span class="truncate font-mono text-[11px] text-dimmed">
                {{ lineage.task?.ref ?? lineage.sessions[0]?.sessionId ?? lineage.subjectId }}
              </span>
              <span
                :class="[
                  'inline-flex shrink-0 items-center gap-1 text-xs font-medium',
                  statusConfig[lineage.status].textClass,
                ]"
              >
                <UIcon
                  :name="statusConfig[lineage.status].icon"
                  :class="['size-3', lineage.status === 'applying' ? 'animate-spin' : '']"
                />
                {{ statusConfig[lineage.status].label }}
              </span>
            </div>
          </button>
        </div>

        <AppEmptyState
          v-else-if="entries.length === 0"
          icon="i-lucide-git-merge"
          title="还没有工作脉络"
          description="从任务或聊天开始讨论后，工作脉络会自动建立。"
          compact
          data-test="lineage-empty"
        />

        <AppEmptyState
          v-else
          icon="i-lucide-list-filter"
          title="没有匹配的脉络"
          description="尝试切换其他筛选条件。"
          compact
          data-test="lineage-filter-empty"
        />
      </div>
    </section>

    <section class="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-default">
      <div v-if="selectedLineage" class="flex h-full flex-col" data-test="lineage-detail">
        <div class="shrink-0 border-b border-default/50 px-5 py-4 lg:px-6">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div class="min-w-0 max-w-2xl">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :color="statusConfig[selectedLineage.status].color"
                  variant="soft"
                  size="sm"
                >
                  <span class="inline-flex items-center gap-1">
                    <UIcon :name="statusConfig[selectedLineage.status].icon" class="size-3" />
                    {{ statusConfig[selectedLineage.status].label }}
                  </span>
                </UBadge>
                <span class="font-mono text-xs text-muted">
                  {{
                    selectedLineage.task?.ref ??
                    selectedLineage.sessions[0]?.sessionId ??
                    selectedLineage.subjectId
                  }}
                </span>
              </div>
              <h1 class="mt-2 text-xl font-semibold tracking-tight text-highlighted">
                {{ lineageTitle(selectedLineage) }}
              </h1>
              <p class="mt-1.5 text-sm leading-6 text-muted">
                {{ lineageDescription(selectedLineage) }}
              </p>
            </div>

            <UButton
              v-if="selectedLineage.task"
              color="neutral"
              variant="ghost"
              icon="i-lucide-list-checks"
              label="查看任务"
              size="sm"
              data-test="lineage-open-task"
              @click="void openTask()"
            />
          </div>

          <dl class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <div class="flex items-center gap-1.5">
              <dt class="sr-only">会话数量</dt>
              <UIcon name="i-lucide-messages-square" class="size-3.5" />
              <dd>{{ selectedLineage.sessions.length }} 个会话</dd>
            </div>
            <div class="flex items-center gap-1.5">
              <dt class="sr-only">计划数量</dt>
              <UIcon name="i-lucide-map" class="size-3.5" />
              <dd>{{ planCount(selectedLineage) }} 个 Plan</dd>
            </div>
            <div class="flex items-center gap-1.5">
              <dt class="sr-only">提案数量</dt>
              <UIcon name="i-lucide-file-text" class="size-3.5" />
              <dd>{{ proposalCount(selectedLineage) }} 个 Proposal</dd>
            </div>
            <div class="flex items-center gap-1.5">
              <dt class="sr-only">更新时间</dt>
              <UIcon name="i-lucide-clock-3" class="size-3.5" />
              <dd>更新于 {{ timeAgo(new Date(selectedLineage.updatedAt)) }}</dd>
            </div>
          </dl>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6 lg:py-6">
          <div class="mx-auto max-w-4xl">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">演进路径</h2>
              <p class="mt-1 text-xs text-muted">按会话分组，展示这项工作如何逐步沉淀。</p>
            </div>

            <div class="relative mt-5">
              <div class="absolute bottom-6 left-[17px] top-6 w-px bg-border" aria-hidden="true" />

              <div class="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
                <div
                  class="z-10 flex size-9 items-center justify-center rounded-xl bg-primary text-white"
                >
                  <UIcon
                    :name="
                      selectedLineage.task ? 'i-lucide-list-checks' : 'i-lucide-message-circle'
                    "
                    class="size-4"
                  />
                </div>
                <div class="pb-5 pt-1.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-medium text-highlighted">
                      {{ selectedLineage.task ? "任务起点" : "对话起点" }}
                    </span>
                    <span class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted">
                      {{
                        selectedLineage.task?.ref ??
                        selectedLineage.sessions[0]?.sessionId ??
                        selectedLineage.subjectId
                      }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-muted">
                    {{
                      selectedLineage.task
                        ? "这条脉络已关联任务，后续讨论归入同一工作目标。"
                        : "这条自由讨论尚未关联任务。"
                    }}
                  </p>
                </div>
              </div>

              <div
                v-for="(session, sessionIndex) in selectedLineage.sessions"
                :key="session.sessionId"
                class="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3"
                data-test="lineage-session"
              >
                <div
                  class="z-10 flex size-9 items-center justify-center rounded-xl border border-default bg-default text-muted"
                >
                  <UIcon name="i-lucide-message-square-text" class="size-4" />
                </div>

                <div :class="sessionIndex === selectedLineage.sessions.length - 1 ? '' : 'pb-5'">
                  <div class="rounded-lg bg-elevated p-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-highlighted">{{
                            session.title
                          }}</span>
                          <UBadge color="neutral" variant="soft" size="sm">Session</UBadge>
                        </div>
                        <p class="mt-1 truncate font-mono text-[11px] text-dimmed">
                          {{ session.sessionId }}
                        </p>
                      </div>
                      <div class="flex shrink-0 items-center gap-2">
                        <span class="text-xs text-muted">
                          {{ session.agentId ?? "Agent 不可用" }} ·
                          {{ timeAgo(new Date(session.updatedAt)) }}
                        </span>
                        <UTooltip text="打开会话">
                          <UButton
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-arrow-up-right"
                            size="xs"
                            aria-label="打开会话"
                            data-test="lineage-open-session"
                            @click="void openSession(session.sessionId)"
                          />
                        </UTooltip>
                      </div>
                    </div>

                    <div
                      v-if="session.plans.length || session.proposals.length"
                      class="mt-4 space-y-2.5"
                    >
                      <div
                        v-for="plan in session.plans"
                        :key="`${session.sessionId}-plan-${plan.slug}`"
                        class="flex items-start gap-3 rounded-lg border border-default/60 bg-default px-3 py-3"
                        data-test="lineage-plan"
                      >
                        <span
                          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info"
                        >
                          <UIcon name="i-lucide-map" class="size-4" />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="flex flex-wrap items-center gap-2">
                            <span class="text-[11px] font-medium uppercase tracking-wide text-muted"
                              >Plan</span
                            >
                            <span class="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted">
                              {{
                                plan.status === "approved"
                                  ? "已批准"
                                  : plan.status === "draft"
                                    ? "草稿"
                                    : "内容不可用"
                              }}
                            </span>
                          </span>
                          <span class="mt-1 block truncate text-sm font-medium text-highlighted">
                            {{ plan.slug }}
                          </span>
                          <span class="mt-1 block text-xs leading-5 text-muted">
                            {{ plan.goal ?? "Plan 文档不可用，已保留原始 slug。" }}
                          </span>
                        </span>
                      </div>

                      <template
                        v-for="proposal in session.proposals"
                        :key="`${session.sessionId}-proposal-${proposal.changeId}`"
                      >
                        <button
                          type="button"
                          class="flex w-full items-start gap-3 rounded-lg border border-default/60 bg-default px-3 py-3 text-left transition-colors duration-150 enabled:hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-default"
                          :disabled="!proposal.title || !proposal.status"
                          data-test="lineage-proposal"
                          @click="void openProposal(proposal)"
                        >
                          <span
                            class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                          >
                            <UIcon name="i-lucide-file-text" class="size-4" />
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="flex flex-wrap items-center gap-2">
                              <span
                                class="text-[11px] font-medium uppercase tracking-wide text-muted"
                                >Proposal</span
                              >
                              <span
                                :class="[
                                  'text-[11px] font-medium',
                                  proposalStatusClass(proposal.status),
                                ]"
                              >
                                {{ proposalStatusLabel(proposal.status) }}
                              </span>
                            </span>
                            <span class="mt-1 block truncate text-sm font-medium text-highlighted">
                              {{ proposalTitle(proposal) }}
                            </span>
                            <span class="mt-1 block font-mono text-xs text-muted">
                              {{ proposal.changeId }}
                            </span>
                          </span>
                          <UIcon
                            v-if="proposal.title && proposal.status"
                            name="i-lucide-chevron-right"
                            class="mt-1 size-4 shrink-0 text-dimmed"
                          />
                        </button>

                        <button
                          v-if="proposal.commitHash"
                          type="button"
                          class="flex w-full items-start gap-3 rounded-lg border border-default/60 bg-default px-3 py-3 text-left transition-colors duration-150 hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          data-test="lineage-commit"
                          @click="void copyCommitHash(proposal.commitHash)"
                        >
                          <span
                            class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"
                          >
                            <UIcon name="i-lucide-git-commit-horizontal" class="size-4" />
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="text-[11px] font-medium uppercase tracking-wide text-muted"
                              >Commit</span
                            >
                            <span
                              class="mt-1 block truncate font-mono text-sm font-medium text-highlighted"
                            >
                              {{ proposal.commitHash }}
                            </span>
                            <span class="mt-1 block text-xs text-muted"
                              >点击复制完整 Commit hash</span
                            >
                          </span>
                          <UIcon name="i-lucide-copy" class="mt-1 size-4 shrink-0 text-dimmed" />
                        </button>
                      </template>
                    </div>

                    <div
                      v-else
                      class="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-default px-3 py-3 text-xs text-muted"
                      data-test="lineage-discussion-only"
                    >
                      <UIcon name="i-lucide-message-circle-dashed" class="size-4" />
                      当前只有讨论记录，还没有形成 Plan 或 Proposal。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AppEmptyState
        v-else
        icon="i-lucide-git-merge"
        title="选择一条工作脉络"
        description="从左侧列表选择后查看完整演进路径。"
        data-test="lineage-no-selection"
      />
    </section>
  </div>
</template>
