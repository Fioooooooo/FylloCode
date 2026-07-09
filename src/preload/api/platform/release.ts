import { ipcRenderer } from "electron";
import { PlatformReleaseChannels } from "@shared/ipc/platform/release.channels";
import type { IpcResponse } from "@shared/types/ipc";
import type { ReleaseCheckResult } from "@shared/types/settings";

export const releaseApi = {
  checkLatestRelease(): Promise<IpcResponse<ReleaseCheckResult>> {
    return ipcRenderer.invoke(PlatformReleaseChannels.checkLatestRelease, {});
  },
};
