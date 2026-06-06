import log from "electron-log/main";
import { join } from "path";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { getLogsPath } from "@main/infra/paths";

// 开发环境：data/logs/main.log；生产环境：electron-log 平台默认路径
log.transports.file.resolvePathFn = (variables) => {
  if (is.dev) {
    return join(getLogsPath(), "main.log");
  }
  return join(
    variables.electronDefaultDir ?? app.getPath("logs"),
    variables.fileName ?? "main.log"
  );
};

// 生产环境 console transport 只输出 warn 及以上
if (!is.dev) {
  log.transports.console.level = "warn";
}

// 捕获未处理的异常和 Promise rejection
log.errorHandler.startCatching();

// 初始化，使渲染进程可通过 electron-log/renderer 使用同一日志管道
log.initialize();

export default log;
