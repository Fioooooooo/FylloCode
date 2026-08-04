import { ipcRenderer } from "electron";
import { PlatformLifecycleChannels } from "@shared/ipc/platform/lifecycle.channels";

export const lifecycleApi = {
  markInteractive(): void {
    ipcRenderer.send(PlatformLifecycleChannels.rendererInteractive);
  },
};
