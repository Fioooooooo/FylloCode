import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

const processEntryAt = performance.now();

if (!app.isPackaged) {
  const devUserDataPath = join(process.cwd(), "data");

  // 单实例锁使用 userData 作为隔离域；dev 必须先绑定当前 worktree，避免抢占已安装应用或其他 worktree。
  mkdirSync(devUserDataPath, { recursive: true });
  app.setPath("userData", devUserDataPath);
}

interface PrimaryInstanceController {
  requestWindowAttention(): void;
}

let primaryInstanceController: PrimaryInstanceController | null = null;
let hasPendingWindowAttention = false;

function requestPrimaryWindowAttention(): void {
  if (!primaryInstanceController) {
    hasPendingWindowAttention = true;
    return;
  }

  primaryInstanceController.requestWindowAttention();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const singleInstanceLockAt = performance.now();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", requestPrimaryWindowAttention);

  void import("@main/bootstrap").then(({ startApp }) => {
    primaryInstanceController = startApp({ processEntryAt, singleInstanceLockAt });

    if (hasPendingWindowAttention) {
      hasPendingWindowAttention = false;
      primaryInstanceController.requestWindowAttention();
    }
  });
}
