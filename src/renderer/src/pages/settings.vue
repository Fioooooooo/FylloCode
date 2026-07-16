<script setup lang="ts">
import { useRoute } from "vue-router";

definePage({
  redirect: "/settings/acp-agents",
});

const route = useRoute();

const navigationItems = [
  {
    id: "preferences",
    label: "偏好设置",
    icon: "i-lucide-sliders-horizontal",
    path: "/settings/preferences",
  },
  {
    id: "agents",
    label: "Agents",
    icon: "i-lucide-bot",
    path: "/settings/acp-agents",
  },
  {
    id: "connections",
    label: "服务连接",
    icon: "i-lucide-plug-zap",
    path: "/settings/connections",
  },
  { id: "about", label: "关于我们", icon: "i-lucide-info", path: "/settings/about" },
] as const;

function isActive(path: string): boolean {
  return route.path === path;
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-elevated space-x-2">
    <nav class="flex w-65 shrink-0 flex-col gap-1 bg-default rounded-lg px-2 py-4 overflow-auto">
      <RouterLink
        v-for="item in navigationItems"
        :key="item.id"
        :to="item.path"
        class="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
        :class="
          isActive(item.path)
            ? 'bg-primary/15 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-primary'
            : 'hover:bg-elevated'
        "
        :data-test="`settings-nav-${item.id}`"
      >
        <UIcon :name="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </RouterLink>
    </nav>

    <div class="flex-1 flex min-w-0">
      <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
        <div class="mx-auto max-w-2xl px-6 py-8 w-full" data-test="settings-route-content">
          <RouterView />
        </div>
      </div>
    </div>
  </div>
</template>
