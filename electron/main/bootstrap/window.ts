import { shell, BrowserWindow } from "electron";
import { join } from "path";
import { is, platform } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(platform.isLinux ? { icon } : {}),
    ...(platform.isMacOS
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 12, y: 10 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
