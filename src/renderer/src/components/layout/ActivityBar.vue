<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useProjectStore } from "@renderer/stores/project";
import { activityBarItems } from "@renderer/config/activity-bar";

const route = useRoute();
const projectStore = useProjectStore();

const hasProject = computed(() => projectStore.hasCurrentProject);

const items = computed(() => activityBarItems.filter((i) => i.group === "top"));
const bottomItems = computed(() => activityBarItems.filter((i) => i.group === "bottom"));
const brandIconSrc = `${import.meta.env.BASE_URL}icon.svg`;

const activeItem = computed(() => {
  const matches = activityBarItems.filter((i) => route.path.startsWith(i.path));
  if (matches.length === 0) return null;
  // Longest prefix wins for future nested app routes.
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0].id;
});
</script>

<template>
  <div
    class="w-16 h-full flex flex-col items-center gap-3 py-3 bg-muted/30 border-r border-default/50 shrink-0"
    data-test="activity-bar"
  >
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-inset ring-default mb-1"
      data-test="activity-bar-brand"
    >
      <img :src="brandIconSrc" alt="FylloCode" class="size-6" data-test="activity-bar-brand-icon" />
    </div>

    <div class="flex w-full flex-col items-center gap-1" data-test="activity-bar-menu">
      <template v-for="item in items" :key="item.id">
        <UTooltip :text="item.label" :content="{ align: 'center', side: 'right' }">
          <UButton
            variant="ghost"
            size="sm"
            class="relative size-10 rounded-lg"
            :class="[
              activeItem === item.id
                ? 'bg-primary/15 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-primary'
                : 'text-muted hover:bg-elevated',
            ]"
            :disabled="!hasProject"
            :to="hasProject ? item.path : undefined"
            :data-test="`activity-bar-item-${item.id}`"
          >
            <UIcon :name="item.icon" class="size-5" />
          </UButton>
        </UTooltip>
      </template>
    </div>

    <div class="flex-1 w-full" />

    <div class="flex w-full flex-col items-center gap-1" data-test="activity-bar-settings">
      <template v-for="item in bottomItems" :key="item.id">
        <UTooltip :text="item.label" :content="{ align: 'center', side: 'right' }">
          <UButton
            variant="ghost"
            size="sm"
            class="relative size-10 rounded-lg"
            :class="[
              activeItem === item.id
                ? 'bg-primary/15 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-primary'
                : 'text-muted hover:bg-elevated',
            ]"
            :to="item.path"
            :data-test="`activity-bar-item-${item.id}`"
          >
            <UIcon :name="item.icon" class="size-5" />
          </UButton>
        </UTooltip>
      </template>
    </div>
  </div>
</template>
