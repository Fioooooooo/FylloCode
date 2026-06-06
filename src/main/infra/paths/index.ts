import { app } from "electron";
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
  | "apply-runs"
  | "migrations";

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

/**
 * 获取资源目录路径
 *
 * - 开发环境：项目根目录的 resources，方便访问未打包的资源文件
 * - 生产环境：使用 Electron 的 resourcesPath，并优先访问 app.asar.unpacked 中的资源，确保可以访问到被 asar 打包的资源文件
 */
export function getResourcesPath(): string {
  if (is.dev) {
    return join(process.cwd(), "resources");
  }

  return join(getAppUnpackedPath(), "resources");
}

/**
 * 获取 app.asar 目录路径
 */
export function getAppAsarPath(): string {
  return join(process.resourcesPath, "app.asar");
}

/**
 * 获取 app.asar.unpacked 目录路径
 */
export function getAppUnpackedPath(): string {
  return join(process.resourcesPath, "app.asar.unpacked");
}
