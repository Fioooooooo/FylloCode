import { ipcMain } from "electron";
import { PlatformLifecycleChannels } from "@shared/ipc/platform/lifecycle.channels";
import { markRendererInteractive } from "@main/services/platform/lifecycle/renderer-readiness";

export function registerLifecycleHandlers(): void {
  ipcMain.on(PlatformLifecycleChannels.rendererInteractive, (event) => {
    markRendererInteractive(event.sender);
  });
}
