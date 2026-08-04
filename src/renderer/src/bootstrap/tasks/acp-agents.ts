import { useAcpAgentsStore } from "@renderer/stores";
import { onFylloBootstrap } from "../core";

export function registerAcpAgentsTask(): void {
  onFylloBootstrap({
    name: "acp-agents",
    phase: "background",
    async run({ pinia }) {
      const store = useAcpAgentsStore(pinia);
      await Promise.all([store.loadCapabilitiesCache(), store.ensureInitialized()]);
    },
  });
}
