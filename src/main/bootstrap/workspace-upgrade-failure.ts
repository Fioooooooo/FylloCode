import { app, dialog, shell } from "electron";
import logger from "@main/infra/logger";

export interface WorkspaceUpgradeFailureDetails {
  migrationId: string;
  reason?: string;
}

export async function showWorkspaceUpgradeFailure(
  details: WorkspaceUpgradeFailureDetails
): Promise<void> {
  const logsPath = app.getPath("logs");

  try {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "FylloCode 数据升级失败",
      message: "FylloCode 数据升级失败",
      detail: [
        "FylloCode 无法完成 Project / Workspace 数据升级。无法确认归属的旧数据不会被删除。",
        "修复底层权限或数据冲突后，下次启动会自动重试数据升级。",
        `Migration: ${details.migrationId}`,
        `日志目录: ${logsPath}`,
        ...(details.reason ? [`原因: ${details.reason}`] : []),
      ].join("\n\n"),
      buttons: ["打开日志目录", "退出 FylloCode"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response === 0) {
      try {
        const openError = await shell.openPath(logsPath);
        if (openError) {
          logger.error(`[workspace-upgrade] unable to open logs directory: ${openError}`);
        }
      } catch (error) {
        logger.error(
          `[workspace-upgrade] unable to open logs directory: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } catch (error) {
    logger.error(
      `[workspace-upgrade] unable to show failure dialog: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    app.quit();
  }
}
