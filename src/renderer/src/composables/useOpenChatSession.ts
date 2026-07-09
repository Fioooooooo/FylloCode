import { nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useChatStore, useSessionStore } from "@renderer/stores";

export interface UseOpenChatSessionReturn {
  openChatSession: (sessionId: string) => Promise<void>;
}

export function useOpenChatSession(): UseOpenChatSessionReturn {
  const router = useRouter();
  const route = useRoute();
  const chatStore = useChatStore();
  const sessionStore = useSessionStore();

  async function openChatSession(sessionId: string): Promise<void> {
    chatStore.resetChatState();

    if (route.path !== "/chat") {
      await router.push("/chat");
    }

    await nextTick();
    await sessionStore.selectSession(sessionId);
  }

  return {
    openChatSession,
  };
}
