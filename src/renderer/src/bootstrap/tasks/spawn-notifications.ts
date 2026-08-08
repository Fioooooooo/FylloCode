import { chatApi } from "@renderer/api/session/chat";
import { useChatStore, useWorkspaceStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

let unsubscribeWake: (() => void) | null = null;

export function registerSpawnNotificationsTask(): void {
  onFylloBootstrap({
    name: "spawn-notifications",
    phase: "background",
    async run({ pinia }) {
      unsubscribeWake?.();
      const workspaceStore = useWorkspaceStore(pinia);
      const chatStore = useChatStore(pinia);
      unsubscribeWake = chatApi.onSpawnNotificationsWake(({ workspaceId }) => {
        if (workspaceStore.currentWorkspace?.id !== workspaceId) return;
        void chatStore.requestSpawnNotificationDrain(workspaceId);
      });
      const workspaceId = workspaceStore.currentWorkspace?.id;
      if (workspaceId) await chatStore.requestSpawnNotificationDrain(workspaceId);
    },
  });
}

export function resetSpawnNotificationsTaskForTests(): void {
  unsubscribeWake?.();
  unsubscribeWake = null;
}
