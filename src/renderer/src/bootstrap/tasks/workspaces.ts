import { useWorkspaceStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

export function registerWorkspacesTask(): void {
  onFylloBootstrap({
    name: "workspaces",
    phase: "critical",
    async run({ pinia }) {
      await useWorkspaceStore(pinia).bootstrapWindowWorkspace();
    },
  });
}
