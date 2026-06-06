<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@nuxt/ui/composables";
import { buildHealthCheckReminder } from "@renderer/constants/health-check-reminder";
import { useChatStore } from "@renderer/stores/chat";
import { useProjectStore } from "@renderer/stores/project";
import { useSessionStore } from "@renderer/stores/session";

const router = useRouter();
const toast = useToast();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const chatStore = useChatStore();

const open = ref(false);

const healthScore = computed(() => projectStore.currentProject?.healthScore ?? 0);
const iconColorClass = computed(() => {
  if (healthScore.value >= 60) {
    return "text-green-500";
  }

  if (healthScore.value >= 1) {
    return "text-orange-500";
  }

  return "text-muted";
});
const statusText = computed(() =>
  healthScore.value > 0 ? `上次健康检查得分：${healthScore.value} 分` : "当前项目尚未进行健康检查"
);

function handleIconClick(): void {
  open.value = true;
  void projectStore.refreshCurrentProject().catch(() => {});
}

async function startHealthCheck(): Promise<void> {
  open.value = false;
  const project = projectStore.currentProject;
  if (!project) {
    return;
  }

  try {
    sessionStore.beginDraftSession();
    await chatStore.sendMessage([
      { type: "text", text: buildHealthCheckReminder(project) },
      {
        type: "text",
        text: "帮我根据当前项目技术栈检查：静态约束、测试约束、流程约束的配置情况并完善",
      },
    ]);
    await router.push("/chat");
  } catch (error: unknown) {
    toast.add({
      title: "健康检查启动失败",
      description: error instanceof Error ? error.message : String(error),
      color: "error",
    });
  }
}
</script>

<template>
  <UPopover
    v-if="projectStore.currentProject"
    :open="open"
    :content="{ align: 'center', side: 'bottom', sideOffset: 6 }"
    :ui="{ content: 'w-64 p-3' }"
    @update:open="open = $event"
  >
    <template #default>
      <UButton
        data-test="project-health-button"
        variant="ghost"
        color="neutral"
        class="w-5.5 h-5.5 rounded-full border border-default flex items-center justify-center p-0"
        style="-webkit-app-region: no-drag"
        aria-label="项目健康度"
        @click="handleIconClick"
      >
        <UIcon
          data-test="project-health-icon"
          name="i-lucide-heart-pulse"
          :class="['w-4 h-4 transition-colors', iconColorClass]"
        />
      </UButton>
    </template>

    <template #content>
      <div class="flex flex-col gap-3" style="-webkit-app-region: no-drag">
        <p data-test="project-health-status" class="text-sm text-default">
          {{ statusText }}
        </p>
        <UButton
          data-test="project-health-start"
          size="sm"
          color="primary"
          icon="i-lucide-activity"
          block
          @click="startHealthCheck"
        >
          开始健康检查
        </UButton>
      </div>
    </template>
  </UPopover>
</template>
