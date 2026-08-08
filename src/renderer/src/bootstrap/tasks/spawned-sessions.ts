import { watch, type WatchStopHandle } from "vue";
import { spawnedSessionApi } from "@renderer/api/session/spawned-session";
import { useSpawnedSessionStore, useWorkspaceStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

let unsubscribeWake: (() => void) | null = null;
let stopWorkspaceWatch: WatchStopHandle | null = null;

export function registerSpawnedSessionsTask(): void {
  onFylloBootstrap({
    name: "spawned-sessions",
    phase: "background",
    run({ pinia }) {
      unsubscribeWake?.();
      stopWorkspaceWatch?.();
      const workspaceStore = useWorkspaceStore(pinia);
      const sessionStore = useSpawnedSessionStore(pinia);
      unsubscribeWake = spawnedSessionApi.onWake((payload) => {
        if (workspaceStore.currentWorkspace?.id !== payload.workspaceId) return;
        void sessionStore.handleWake(payload);
      });
      stopWorkspaceWatch = watch(
        () => workspaceStore.currentWorkspace?.id,
        (_next, previous) => {
          if (previous) sessionStore.resetWorkspace(previous);
        }
      );
    },
  });
}

export function resetSpawnedSessionsTaskForTests(): void {
  unsubscribeWake?.();
  stopWorkspaceWatch?.();
  unsubscribeWake = null;
  stopWorkspaceWatch = null;
}
