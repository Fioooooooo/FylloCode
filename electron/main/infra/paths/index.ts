import { app } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

type SubPath =
  | "projects"
  | "settings"
  | "window-state"
  | "sessions"
  | "integrations"
  | "acp"
  | "workflows"
  | "apply-runs";

/**
 * 获取业务数据子目录路径
 *
 * - 开发环境：项目根目录的 data/{subPath}，方便排查问题
 * - 生产环境：遵循 Electron 规范，使用 userData/{subPath}
 *
 * @param subPath 子目录名，如 "projects", "settings", "sessions"
 */
export function getDataSubPath(subPath: SubPath): string {
  const base = is.dev ? join(process.cwd(), "data") : app.getPath("userData");
  return join(base, subPath);
}

/**
 * 获取日志目录路径
 *
 * - 开发环境：项目根目录的 data/logs
 * - 生产环境：遵循 Electron 规范，使用 app.getPath("logs")
 */
export function getLogsPath(): string {
  if (is.dev) {
    return join(process.cwd(), "data", "logs");
  }
  return app.getPath("logs");
}

export function getResourcesPath(): string {
  const candidates = getResourcesPathCandidates();
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function getResourcesPathCandidates(): string[] {
  if (is.dev) {
    return [join(process.cwd(), "resources")];
  }

  return [
    join(process.resourcesPath, "app.asar.unpacked", "resources"),
    join(app.getAppPath(), "resources"),
    join(process.resourcesPath, "resources"),
  ];
}
