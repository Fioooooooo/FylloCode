<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@nuxt/ui/composables";
import ChatPageShell from "@renderer/components/chat/ChatPageShell.vue";
import { useSessionStore, useWorkspaceStore } from "@renderer/stores";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const sessionStore = useSessionStore();
const workspaceStore = useWorkspaceStore();

function getRouteSessionId(): string | undefined {
  return "sessionId" in route.params ? route.params.sessionId : undefined;
}

async function selectRouteSession(sessionId: string): Promise<void> {
  if (sessionStore.isLoading) return;

  const session = sessionStore.sessions.find((item) => item.id === sessionId);
  if (!session || session.workspaceId !== workspaceStore.currentWorkspace?.id) {
    toast.add({
      title: "会话不可用",
      description: "该会话不存在、已删除或不属于当前 Workspace。",
      color: "error",
    });
    await router.replace("/chat");
    return;
  }

  try {
    await sessionStore.selectSession(sessionId);
    if (sessionStore.activeSessionId !== sessionId) {
      throw new Error("Session is no longer available");
    }
  } catch {
    toast.add({
      title: "会话不可用",
      description: "该会话不存在、已删除或不属于当前 Workspace。",
      color: "error",
    });
    await router.replace("/chat");
  }
}

watch(
  [getRouteSessionId, () => sessionStore.isLoading],
  ([sessionId, isLoading]) => {
    if (isLoading) return;
    if (typeof sessionId === "string") {
      void selectRouteSession(sessionId);
    }
  },
  { immediate: true }
);
</script>

<template>
  <ChatPageShell />
</template>
