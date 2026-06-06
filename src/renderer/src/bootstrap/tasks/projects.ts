import { useProjectStore } from "@renderer/stores/project";
import { onFylloBootstrap } from "../core";

export function registerProjectsTask(): void {
  onFylloBootstrap({
    name: "projects",
    async run({ pinia }) {
      await useProjectStore(pinia).ensureLoaded();
    },
  });
}
