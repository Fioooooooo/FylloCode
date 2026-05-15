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
  // longest prefix wins (e.g. /proposal vs /proposal/:id)
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0].id;
});
</script>

<template>
  <div
    class="w-14 h-full flex flex-col items-center gap-3 py-3 border-r border-default bg-muted/30 shrink-0"
    data-test="activity-bar"
  >
    <div
      class="flex h-8 w-8 items-center justify-center rounded-lg bg-default ring-1 ring-inset ring-default"
      data-test="activity-bar-brand"
    >
      <img
        :src="brandIconSrc"
        alt="FylloCode"
        class="h-5 w-5"
        data-test="activity-bar-brand-icon"
      />
    </div>

    <div class="flex w-full flex-col items-center gap-2" data-test="activity-bar-menu">
      <template v-for="item in items" :key="item.id">
        <UButton
          variant="ghost"
          size="sm"
          class="h-auto w-11 flex-col gap-1 rounded-lg px-1 py-1.5 text-[10px]/3"
          :color="activeItem === item.id ? 'primary' : 'neutral'"
          :disabled="!hasProject"
          :to="hasProject ? item.path : undefined"
          :data-test="`activity-bar-item-${item.id}`"
        >
          <UIcon :name="item.icon" class="size-4" />
          <span class="text-center leading-[1.1] break-words">{{ item.label }}</span>
        </UButton>
      </template>
    </div>

    <div class="flex-1 w-full" />

    <div class="flex w-full flex-col items-center gap-2" data-test="activity-bar-settings">
      <template v-for="item in bottomItems" :key="item.id">
        <UButton
          variant="ghost"
          size="sm"
          class="h-auto w-11 flex-col gap-1 rounded-lg px-1 py-1.5 text-[10px]/3"
          :color="activeItem === item.id ? 'primary' : 'neutral'"
          :to="item.path"
          :data-test="`activity-bar-item-${item.id}`"
        >
          <UIcon :name="item.icon" class="size-4" />
          <span class="text-center leading-[1.1] break-words">{{ item.label }}</span>
        </UButton>
      </template>
    </div>
  </div>
</template>
