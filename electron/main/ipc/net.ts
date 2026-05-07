import { ipcMain, net } from "electron";
import { NetChannels } from "@shared/types/channels";
import { netFetchInputSchema } from "@shared/schemas/ipc/net";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";

export function registerNetHandlers(): void {
  ipcMain.handle(NetChannels.fetch, (_event, url: unknown) =>
    wrapHandler(async () => {
      const target = validate(netFetchInputSchema, url);
      const res = await net.fetch(target);
      return res.json();
    })
  );

  ipcMain.handle(NetChannels.fetchImage, (_event, url: unknown) =>
    wrapHandler(async () => {
      const target = validate(netFetchInputSchema, url);
      const res = await net.fetch(target);
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") ?? "image/png";
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:${contentType};base64,${base64}`;
    })
  );
}
