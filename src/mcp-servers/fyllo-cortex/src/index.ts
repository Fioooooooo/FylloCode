process.env.DO_NOT_TRACK = "1";

import { startServer } from "./server";

const controller = new AbortController();

process.on("SIGTERM", () => controller.abort());
process.on("SIGINT", () => controller.abort());

void startServer(controller.signal);
