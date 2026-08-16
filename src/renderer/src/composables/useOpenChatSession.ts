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

  function getRouteSessionId(): string | undefined {
    return "sessionId" in route.params ? route.params.sessionId : undefined;
  }

  async function openChatSession(sessionId: string): Promise<void> {
    chatStore.resetChatState();

    if (getRouteSessionId() === sessionId) {
      await sessionStore.selectSession(sessionId);
      return;
    }

    await router.push(`/chat/${sessionId}`);
    await sessionStore.selectSession(sessionId);
  }

  return {
    openChatSession,
  };
}
