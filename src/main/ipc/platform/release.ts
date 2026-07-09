import { ipcMain } from "electron";
import { PlatformReleaseChannels } from "@shared/ipc/platform/release.channels";
import { checkLatestReleaseInputSchema } from "@shared/ipc/platform/release.schemas";
import { checkLatestRelease } from "@main/services/platform/release/release-version-service";
import { validate } from "../_kit/schema";
import { wrapHandler } from "../_kit/wrap-handler";

export function registerReleaseHandlers(): void {
  ipcMain.handle(PlatformReleaseChannels.checkLatestRelease, (_event, input: unknown) =>
    wrapHandler(async () => {
      validate(checkLatestReleaseInputSchema, input);
      return checkLatestRelease();
    })
  );
}
