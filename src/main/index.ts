import { app } from "electron";

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", requestPrimaryWindowAttention);

  void import("@main/bootstrap").then(({ startApp }) => {
    primaryInstanceController = startApp();

    if (hasPendingWindowAttention) {
      hasPendingWindowAttention = false;
      primaryInstanceController.requestWindowAttention();
    }
  });
}
