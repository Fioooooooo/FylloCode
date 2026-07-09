import type { IpcResponse } from "@shared/types/ipc";
import type { ReleaseCheckResult } from "@shared/types/settings";

export const releaseApi = {
  checkLatestRelease(): Promise<IpcResponse<ReleaseCheckResult>> {
    return window.api.platform.release.checkLatestRelease();
  },
};
