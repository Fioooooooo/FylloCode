// Re-export from shared so `ipcError` is importable from either
// `@main/ipc/_kit/errors` (IPC layer) or `@shared/errors/ipc-error`
// (everywhere else including infra).
export { ipcError, type IpcError } from "@shared/errors/ipc-error";
